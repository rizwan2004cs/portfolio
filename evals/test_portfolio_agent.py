"""Single-turn end-to-end evals of the portfolio agent (POST /api/agent, AG-UI stream).

No tracing: the agent is a TypeScript route evaluated as a black box over HTTP, so each
golden becomes an LLMTestCase built from the parsed stream (DeepEval's no-tracing path).

    deepeval test run test_portfolio_agent.py
"""

from __future__ import annotations

from pathlib import Path

import pytest

from deepeval import assert_test
from deepeval.dataset import EvaluationDataset, Golden
from deepeval.test_case import LLMTestCase, ToolCall

from agent_client import run_agent
from conftest import record
from metrics import metrics_for

HERE = Path(__file__).resolve().parent
dataset = EvaluationDataset()
dataset.add_goldens_from_json_file(file_path=str(HERE / ".dataset.json"))


# each case is marked with its category, so one slice can run alone: deepeval test run test_portfolio_agent.py -m ground
CASES = [pytest.param(g, id=g.name, marks=getattr(pytest.mark, g.additional_metadata["category"])) for g in dataset.goldens]


@pytest.mark.parametrize("golden", CASES)
def test_portfolio_agent(golden: Golden):
    meta = golden.additional_metadata or {}
    run = run_agent([golden.input], shown=meta.get("shown", []), kill_model=bool(meta.get("killModel")), key=golden.name)
    summary = run.summary()
    record(golden.name, meta["category"], {"input": golden.input, **summary})

    test_case = LLMTestCase(
        name=golden.name,
        input=golden.input,
        actual_output=run.text or "(no text)",
        retrieval_context=golden.retrieval_context,
        tools_called=[ToolCall(name=c["name"], input_parameters=c["args"] if isinstance(c["args"], dict) else None)
                      for c in run.tool_calls if c["name"] != "suggest"],
        expected_tools=golden.expected_tools,
        metadata={"golden": meta, "run": {**summary, "finished": run.finished, "raw": run.raw}},
        tags=[meta["category"]],
    )
    assert_test(test_case=test_case, metrics=metrics_for(meta["category"]), run_async=False)
