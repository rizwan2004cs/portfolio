"""Black-box client for the portfolio agent: POST /api/agent, parse the AG-UI SSE stream.

Pacing follows the app's limits: 12 requests/min per IP (each case sends its own
X-Forwarded-For) and Groq's ~8k tokens/min per model (a gap between runs, and one
61s retry when a run was throttled into router/partial mode).
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from pydantic import TypeAdapter, ValidationError

try:  # AG-UI protocol schemas, the Python twin of @ag-ui/core/schemas used by scripts/eval-live.mjs
    from ag_ui.core import Event as _AguiEvent

    _AGUI = TypeAdapter(_AguiEvent)
except Exception:  # pragma: no cover - optional dependency
    _AGUI = None

BASE_URL = os.environ.get("AGENT_BASE_URL", "http://localhost:3000")
GAP_S = float(os.environ.get("EVAL_GAP_MS", "4000")) / 1000
THROTTLE_WAIT_S = float(os.environ.get("EVAL_THROTTLE_WAIT_S", "61"))
NO_RETRY = bool(os.environ.get("EVAL_NO_RETRY"))

_last_call = 0.0


@dataclass
class AgentRun:
    turns: list[str]
    shown: list[str]
    kill_model: bool
    status: int = 0
    raw: str = ""
    events: list[dict[str, Any]] = field(default_factory=list)
    retried: bool = False
    key_leaked: bool = False
    invalid_events: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(e.get("delta", "") for e in self.events if e.get("type") == "TEXT_MESSAGE_CONTENT").strip()

    def custom(self, name: str) -> list[Any]:
        return [e.get("value") for e in self.events if e.get("type") == "CUSTOM" and e.get("name") == name]

    @property
    def panels(self) -> list[str]:
        """'kind:id' for panels, 'approval:<action>' for approvals, 'frontend:<name>' for frontend tools."""
        out = []
        for p in self.custom("panel"):
            out.append(f"{p.get('kind')}:{p['id']}" if p.get("id") else str(p.get("kind")))
        out += [f"approval:{a.get('action')}" for a in self.custom("approval")]
        out += [f"frontend:{f.get('name')}" for f in self.custom("frontend_tool")]
        return out

    @property
    def suggestions(self) -> list[str]:
        return [o for s in self.custom("suggest") for o in (s.get("options") or [])]

    @property
    def traces(self) -> list[dict[str, Any]]:
        return self.custom("trace")

    @property
    def tool_calls(self) -> list[dict[str, Any]]:
        calls: dict[str, dict[str, Any]] = {}
        for e in self.events:
            t = e.get("type")
            if t == "TOOL_CALL_START":
                calls[e["toolCallId"]] = {"name": e.get("toolCallName"), "args": ""}
            elif t == "TOOL_CALL_ARGS" and e.get("toolCallId") in calls:
                calls[e["toolCallId"]]["args"] += e.get("delta", "")
        for c in calls.values():
            try:
                c["args"] = json.loads(c["args"] or "{}")
            except json.JSONDecodeError:
                pass
        return list(calls.values())

    @property
    def finished(self) -> bool:
        return bool(self.events) and self.events[-1].get("type") == "RUN_FINISHED"

    @property
    def result(self) -> dict[str, Any]:
        return (self.events[-1].get("result") or {}) if self.finished else {}

    @property
    def mode(self) -> str:
        return str(self.result.get("mode", "?"))

    @property
    def throttled(self) -> bool:
        return any("HTTP 429" in str(t.get("detail", "")) for t in self.traces) and self.mode in ("router", "partial")

    def summary(self) -> dict[str, Any]:
        return {
            "turns": self.turns,
            "shown": self.shown,
            "killModel": self.kill_model,
            "status": self.status,
            "mode": self.mode,
            "model": self.result.get("model"),
            "text": self.text,
            "panels": self.panels,
            "tools": [c["name"] for c in self.tool_calls],
            "suggestions": self.suggestions,
            "traces": [f"{t.get('step')}: {t.get('detail')}" for t in self.traces],
            "retried": self.retried,
            "invalid_events": self.invalid_events,
            "key_leaked": self.key_leaked,
        }


def _secret() -> str | None:
    try:
        from judge import groq_api_key

        return groq_api_key()
    except Exception:
        return None


def _ip_for(key: str) -> str:
    h = hashlib.sha1(f"{key}{time.time_ns()}".encode()).digest()
    return f"10.{h[0]}.{h[1]}.{max(1, h[2] % 250)}"


def _post(turns: list[str], shown: list[str], kill_model: bool, ip: str) -> AgentRun:
    run = AgentRun(turns=turns, shown=shown, kill_model=kill_model)
    with httpx.Client(timeout=90) as client:
        r = client.post(
            f"{BASE_URL}/api/agent",
            json={"turns": turns, "shown": shown, "killModel": kill_model},
            headers={"Content-Type": "application/json", "X-Forwarded-For": ip},
        )
    run.status, run.raw = r.status_code, r.text
    secret = _secret()
    if secret and secret in run.raw:  # flag it, then make sure the key itself never reaches a results file
        run.key_leaked = True
        run.raw = run.raw.replace(secret, "[REDACTED_GROQ_KEY]")
    for block in r.text.split("\n\n"):
        block = block.strip()
        if not block.startswith("data:"):
            continue
        try:
            ev = json.loads(block[len("data:") :].strip())
        except json.JSONDecodeError:
            run.invalid_events.append(block[:120])
            continue
        run.events.append(ev)
        if _AGUI is not None:
            try:
                _AGUI.validate_python(ev)
            except ValidationError as e:
                run.invalid_events.append(f"{ev.get('type')}: {str(e).splitlines()[0][:120]}")
    return run


def run_agent(turns: list[str], shown: list[str] | None = None, kill_model: bool = False, key: str = "") -> AgentRun:
    """One visitor turn. Paces calls, and waits out one Groq throttle window before retrying once."""
    global _last_call
    shown = shown or []
    wait = GAP_S - (time.monotonic() - _last_call)
    if wait > 0:
        time.sleep(wait)
    ip = _ip_for(key or "|".join(turns))
    run = _post(turns, shown, kill_model, ip)
    _last_call = time.monotonic()
    if run.throttled and not NO_RETRY:
        time.sleep(THROTTLE_WAIT_S)
        run = _post(turns, shown, kill_model, _ip_for(key + "retry"))
        run.retried = True
        _last_call = time.monotonic()
    return run


def server_up() -> bool:
    try:
        return httpx.get(BASE_URL, timeout=5).status_code < 500
    except httpx.HTTPError:
        return False
