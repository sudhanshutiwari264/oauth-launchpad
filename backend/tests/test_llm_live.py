"""
Live integration tests for the TarqaAI connection. Requires TARQA_API_KEY
(and TARQA_MODEL) to be set in the environment; skipped otherwise.

Run on its own: pytest tests/test_llm_live.py -v

Note: chat completions will fail for every model if this TarqaAI workspace
has an MCP Connector turned on (Build -> MCP Connectors in the dashboard).
Connectors auto-attach their tools to every /v1/chat/completions request,
and a connector with an invalid tool schema (e.g. one using the JSON Schema
keyword `patternProperties`) breaks every single chat completion regardless
of which model you call. Turning connectors off fixes it immediately.
"""

import os

import llm
import pytest

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(not os.environ.get("TARQA_API_KEY"), reason="TARQA_API_KEY not set"),
]


def test_configured_model_is_available():
    models = llm.list_available_models()
    assert os.environ["TARQA_MODEL"] in models


def test_chat_completion_succeeds():
    result = llm.extract_requirements(
        "GitHub",
        "github.com",
        [
            {
                "url": "https://docs.github.com/en/apps/oauth-apps",
                "title": "OAuth apps",
                "excerpt": "OAuth Apps let you build integrations with GitHub.",
            }
        ],
    )
    assert isinstance(result, dict)
