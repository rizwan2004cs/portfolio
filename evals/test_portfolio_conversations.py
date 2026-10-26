"""Multi-turn evals: scripted pronoun follow-ups and a mid-conversation injection.

The agent is stateless per request (the client sends every visitor turn plus the ids on
screen), so each conversation is replayed turn by turn and graded as a
ConversationalTestCase. Scripted turns, not ConversationSimulator: the point is a fixed
follow-up ("how does it handle failures?") that must resolve to the earlier project.

    deepeval test run test_portfolio_conversations.py
"""

from __future__ import annotations

from pathlib import Path

import pytest

from deepeval import assert_test
from deepeval.dataset import ConversationalGolden, EvaluationDataset
from deepeval.test_case import ConversationalTestCase, ToolCall, Turn

from agent_client import run_agent
from conftest import record
from metrics import MULTI_TURN_METRICS

HERE = Path(__file__).resolve().parent
dataset = EvaluationDataset()
dataset.add_goldens_from_json_file(file_path=str(HERE / ".dataset.multiturn.json"))

SHOWN_KINDS = {"index", "profile", "harness"}


def _shown_ids(panels: list[str]) -> list[str]:
    out = []
    for p in panels:
        kind, _, pid = p.partition(":")
        if pid and kind in ("project", "architecture"):
            out.append(pid)
        elif kind in SHOWN_KINDS:
            out.append(kind)
    return out


@pytest.mark.multi
@pytest.mark.parametrize("golden", dataset.goldens, ids=[g.name for g in dataset.goldens])
def test_portfolio_conversation(golden: ConversationalGolden):
    meta = golden.additional_metadata or {}
    user_turns = [t.content for t in golden.turns if t.role == "user"]
    turns: list[Turn] = []
    runs, shown, sent = [], [], []
    for i, content in enumerate(user_turns):
        sent.append(content)
        run = run_agent(list(sent), shown=list(shown), key=f"{golden.name}-{i}")
        summary = run.summary()
        runs.append({**summary, "finished": run.finished, "raw": run.raw})
        turns.append(Turn(role="user", content=content))
        turns.append(Turn(
            role="assistant",
            content=run.text or "(no text)",
            retrieval_context=golden.context,
            tools_called=[ToolCall(name=c["name"]) for c in run.tool_calls if c["name"] != "suggest"] or None,
        ))
        shown += [s for s in _shown_ids(run.panels) if s not in shown]
    record(golden.name, "multi", {"turns": user_turns, "runs": [{k: v for k, v in r.items() if k != "raw"} for r in runs]})

    test_case = ConversationalTestCase(
        name=golden.name,
        scenario=golden.scenario,
        expected_outcome=golden.expected_outcome,
        context=golden.context,
        turns=turns,
        metadata={"golden": meta, "runs": runs},
        tags=["multi"],
    )
    assert_test(test_case=test_case, metrics=MULTI_TURN_METRICS(), run_async=False)
