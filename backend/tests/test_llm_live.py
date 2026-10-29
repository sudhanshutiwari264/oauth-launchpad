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


def test_does_not_attribute_a_third_party_sources_own_url_to_the_provider():
    """Regression test for a real failure seen in production: when a
    third-party auth-proxy page is among the fetched excerpts, the model
    must not present that third party's own callback URL as if it were the
    actual provider's redirect URI rule - it's a fact about the third
    party's product, not about the provider being researched."""
    result = llm.extract_requirements(
        "Figma",
        "figma.com",
        [
            {
                "url": "https://developers.figma.com/docs/rest-api/oauth-apps",
                "title": "OAuth with Figma",
                "excerpt": (
                    "To create an OAuth app, go to your Figma developer settings and register "
                    "a new app. You will receive a Client ID and Client Secret."
                ),
            },
            {
                "url": "https://www.klavis.ai/docs/knowledge-base/oauth_app/figma",
                "title": "Figma OAuth via Klavis",
                "excerpt": (
                    "Klavis AI provides a managed OAuth integration for Figma. Configure your "
                    "app to use https://api.klavis.ai/oauth/figma/callback as the redirect URI "
                    "when using Klavis's managed service."
                ),
            },
        ],
    )
    redirect_text = (result.get("redirect_uri_requirements") or "").lower()
    assert "klavis" not in redirect_text, (
        "Klavis's own callback URL leaked into the provider's redirect_uri_requirements: "
        f"{result.get('redirect_uri_requirements')!r}"
    )
