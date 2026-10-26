"""Suite-wide setup: keep everything local, check the server, record agent transcripts."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"

# Local only: no telemetry, results exported as JSON under evals/results/ (gitignored).
os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "YES")
os.environ.setdefault("DEEPEVAL_RESULTS_FOLDER", str(RESULTS))
os.environ.setdefault("DEEPEVAL_NO_INSPECT_PROMPT", "1")
os.environ.setdefault("DEEPEVAL_DISABLE_DOTENV", "1")  # the key is read explicitly by judge.py, never via dotenv
sys.path.insert(0, str(HERE))

import pytest  # noqa: E402

from agent_client import BASE_URL, server_up  # noqa: E402

TRANSCRIPTS = RESULTS / "transcripts.jsonl"


def pytest_sessionstart(session):
    # transcripts accumulate across runs; summarize.py keeps the newest entry per case
    RESULTS.mkdir(exist_ok=True)


@pytest.fixture(scope="session", autouse=True)
def _agent_server():
    if not server_up():
        pytest.exit(f"agent server not reachable at {BASE_URL}; start it (npm run build && npm start) and rerun", returncode=2)


def record(name: str, category: str, payload: dict) -> None:
    with TRANSCRIPTS.open("a") as f:
        f.write(json.dumps({"name": name, "category": category, **payload}, ensure_ascii=False) + "\n")
