"""Groq-hosted judge model for DeepEval metrics (OpenAI-compatible endpoint).

The judge runs on a Groq model the portfolio agent does NOT use, so its per-model
token bucket never starves the agent (openai/gpt-oss-120b, openai/gpt-oss-20b).
Calls are serial, paced client-side under the model's tokens-per-minute limit,
and retried with backoff on HTTP 429.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from collections import deque
from pathlib import Path
from typing import Optional

from openai import APIConnectionError, APIStatusError, OpenAI, RateLimitError
from pydantic import BaseModel, ValidationError

from deepeval.models import DeepEvalBaseLLM

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
# qwen/qwen3.8-27b: not used by the agent; 8k tokens/min and 1k requests/day on the free tier.
DEFAULT_JUDGE_MODEL = "qwen/qwen3.8-27b"
ENV_FILE = Path(__file__).resolve().parent.parent / ".env.local"


def _secret(name: str) -> str | None:
    """A key from the environment, else from the app's .env.local. Never printed or written anywhere."""
    val = os.environ.get(name, "").strip()
    if val:
        return val
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            m = re.match(rf"\s*(?:export\s+)?{re.escape(name)}\s*=\s*['\"]?([^'\"\s#]+)", line)
            if m:
                return m.group(1)
    return None


def groq_api_key() -> str:
    key = _secret("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set and was not found in ../.env.local")
    return key


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


class _TokenPacer:
    """Sliding 60s window: wait before a call would push estimated usage over the budget."""

    def __init__(self, tokens_per_minute: int):
        self.budget = tokens_per_minute
        self.window: deque[tuple[float, int]] = deque()
        self.lock = threading.Lock()

    def wait(self, tokens: int) -> None:
        with self.lock:
            while True:
                now = time.monotonic()
                while self.window and now - self.window[0][0] > 60:
                    self.window.popleft()
                used = sum(t for _, t in self.window)
                if used + tokens <= self.budget or not self.window:
                    self.window.append((now, tokens))
                    return
                time.sleep(max(0.5, 60 - (now - self.window[0][0]) + 0.2))

    def correct(self, estimated: int, actual: int) -> None:
        """Replace the newest estimate with the real usage reported by the API."""
        with self.lock:
            for i in range(len(self.window) - 1, -1, -1):
                ts, t = self.window[i]
                if t == estimated:
                    self.window[i] = (ts, actual)
                    return


def _extract_json(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    start, end = text.find("{"), text.rfind("}")
    return text[start : end + 1] if start != -1 and end > start else text


class _Backend:
    def __init__(self, label: str, base_url: str, key: str, model: str, tpm: int):
        self.label, self.model = label, model
        self.client = OpenAI(base_url=base_url, api_key=key, max_retries=0, timeout=60)
        self.pacer = _TokenPacer(tpm)
        self.dead = False


class GroqJudge(DeepEvalBaseLLM):
    """DeepEvalBaseLLM over OpenAI-compatible endpoints, JSON-confined via json_object mode.

    Backend chain, each used only while the previous one is rate-limited out or rejected:
      1. Groq, GROQ_API_KEY, JUDGE_MODEL
      2. Groq, each key in GROQ_API_KEYS_FALLBACK (comma list; GROQ_API_KEY_FALLBACK also read), same model
      3. Gemini, GEMINI_API_KEY, JUDGE_GEMINI_MODEL (default gemini-2.5-flash); JUDGE_PREFER=gemini puts it first
    Keys come from the environment or ../.env.local only.
    """

    def __init__(self, model: Optional[str] = None, tokens_per_minute: Optional[int] = None):
        self.model_id = model or os.environ.get("JUDGE_MODEL", DEFAULT_JUDGE_MODEL)
        self.tpm = tokens_per_minute or int(os.environ.get("JUDGE_TPM", "7000"))
        self.max_retries = int(os.environ.get("JUDGE_MAX_RETRIES", "6"))
        self.calls = 0
        self.tokens = 0
        super().__init__(self.model_id)

    def load_model(self):
        backends = [_Backend("groq", GROQ_BASE_URL, groq_api_key(), self.model_id, self.tpm)]
        # extra Groq keys: the app's comma list (GROQ_API_KEYS_FALLBACK), or the older single GROQ_API_KEY_FALLBACK
        extra = [k.strip() for k in (_secret("GROQ_API_KEYS_FALLBACK") or _secret("GROQ_API_KEY_FALLBACK") or "").split(",") if k.strip()]
        for i, k in enumerate(extra, start=2):
            backends.append(_Backend(f"groq-key{i}", GROQ_BASE_URL, k, self.model_id, self.tpm))
        # JUDGE_NO_GEMINI=1 keeps the judge off the Gemini key the site itself falls back to
        if os.environ.get("JUDGE_NO_GEMINI") != "1" and (k := _secret("GEMINI_API_KEY")):
            gm = os.environ.get("JUDGE_GEMINI_MODEL", "gemini-2.5-flash")
            gem = _Backend("gemini", GEMINI_BASE_URL, k, gm, int(os.environ.get("JUDGE_GEMINI_TPM", "200000")))
            # JUDGE_PREFER=gemini: judge on Google's quota first, leaving every Groq key to the agent under test
            if os.environ.get("JUDGE_PREFER", "").lower() == "gemini": backends.insert(0, gem)
            else: backends.append(gem)
        self.backends = backends
        return backends

    def get_model_name(self) -> str:
        return f"groq/{self.model_id}" + (f" (+{len(self.backends) - 1} fallback)" if len(self.backends) > 1 else "")

    def supports_log_probs(self):
        return False

    def supports_json_mode(self):
        return True

    def _complete(self, prompt: str, json_mode: bool) -> str:
        last: Exception | None = None
        live = [b for b in self.backends if not b.dead]
        for i, b in enumerate(live):
            has_next = i < len(live) - 1
            try:
                return self._complete_on(b, prompt, json_mode, retries=2 if has_next else self.max_retries)
            except RateLimitError as e:
                last = e
                if "per day" in str(e).lower() or "tpd" in str(e).lower() or "rpd" in str(e).lower():
                    b.dead = True  # daily quota gone: skip this backend for the rest of the run
            except APIStatusError as e:
                last = e
                if e.status_code in (401, 403, 404):
                    b.dead = True
                elif not has_next:
                    raise
        raise last or RuntimeError("no judge backend available")

    def _complete_on(self, b: _Backend, prompt: str, json_mode: bool, retries: int) -> str:
        estimate = len(prompt) // 3 + 700
        kwargs = dict(
            model=b.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=2048,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        if b.label.startswith("groq") and "qwen3" in b.model:
            kwargs["extra_body"] = {"reasoning_effort": "none"}
        delay = 5.0
        for attempt in range(retries + 1):
            b.pacer.wait(estimate)
            try:
                r = b.client.chat.completions.create(**kwargs)
                self.calls += 1
                if r.usage:
                    self.tokens += r.usage.total_tokens
                    b.pacer.correct(estimate, r.usage.total_tokens)
                return r.choices[0].message.content or ""
            except RateLimitError as e:
                retry_after = e.response.headers.get("retry-after") if e.response is not None else None
                wait = float(retry_after) + 1 if retry_after else delay
                if attempt == retries:
                    raise
                time.sleep(min(wait, 90))
                delay = min(delay * 2, 60)
            except (APIConnectionError, APIStatusError) as e:
                status = getattr(e, "status_code", None)
                # json_object mode can reject a malformed generation with 400 json_validate_failed: retry
                if attempt == retries or (status and status < 500 and status != 400):
                    raise
                time.sleep(delay)
                delay = min(delay * 2, 60)
        raise RuntimeError("unreachable")

    def generate(self, prompt: str, schema: Optional[type[BaseModel]] = None):
        if schema is None:
            return self._complete(prompt, json_mode=False)
        last_err: Exception | None = None
        p = prompt
        for _ in range(3):
            raw = self._complete(p, json_mode=True)
            try:
                return schema.model_validate_json(_extract_json(raw))
            except (ValidationError, json.JSONDecodeError, ValueError) as e:
                last_err = e
                p = (
                    f"{prompt}\n\nYour previous reply did not match the required JSON schema "
                    f"({str(e)[:300]}). Reply with ONLY a JSON object matching this schema:\n"
                    f"{json.dumps(schema.model_json_schema())}"
                )
        raise last_err  # type: ignore[misc]

    async def a_generate(self, prompt: str, schema: Optional[type[BaseModel]] = None):
        # serial by design: the free tier has no headroom for concurrent judge calls
        return self.generate(prompt, schema)


_JUDGE: GroqJudge | None = None


def judge() -> GroqJudge:
    global _JUDGE
    if _JUDGE is None:
        _JUDGE = GroqJudge()
    return _JUDGE
