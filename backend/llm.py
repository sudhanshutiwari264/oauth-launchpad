"""
Thin wrapper around TarqaAI, an OpenAI-API-compatible LLM gateway.

TarqaAI exposes the standard OpenAI chat completions API at a different
base URL, so we use the official OpenAI Python SDK pointed at it instead of
writing our own HTTP client.
"""

import json
import os

from openai import APIError, APITimeoutError, OpenAI

TARQA_BASE_URL = "https://api.tarqaai.com/api/v1"
TARQA_API_KEY = os.environ.get("TARQA_API_KEY")
TARQA_MODEL = os.environ.get("TARQA_MODEL")

# TarqaAI's own docs recommend handling model failover at the application
# level: try a primary model, and fall back to alternatives on error. These
# two env vars are optional extra models to try, in order, if TARQA_MODEL
# fails.
TARQA_MODEL_FALLBACK_2 = os.environ.get("TARQA_MODEL2")
TARQA_MODEL_FALLBACK_3 = os.environ.get("TARQA_MODEL3")

REQUEST_TIMEOUT_SECONDS = 60


class LLMError(Exception):
    """Raised when TarqaAI can't be reached, errors out, or returns unusable output."""


def _client() -> OpenAI:
    if not TARQA_API_KEY:
        raise LLMError("TARQA_API_KEY is not set.")
    return OpenAI(api_key=TARQA_API_KEY, base_url=TARQA_BASE_URL, timeout=REQUEST_TIMEOUT_SECONDS)


def _candidate_models() -> list[str]:
    if not TARQA_MODEL:
        raise LLMError("TARQA_MODEL is not set.")
    return [model for model in [TARQA_MODEL, TARQA_MODEL_FALLBACK_2, TARQA_MODEL_FALLBACK_3] if model]


def list_available_models() -> list[str]:
    """The model ids this TarqaAI account actually has enabled right now."""
    try:
        response = _client().models.list()
    except Exception as exc:
        raise LLMError(f"Could not list TarqaAI models: {exc}") from exc
    return [model.id for model in response.data]


EXTRACTION_SYSTEM_PROMPT = """You are extracting OAuth app setup requirements for developers, \
strictly from the documentation excerpts you are given.

Rules:
- Only state facts directly supported by the provided excerpts.
- If something is not covered by the excerpts, leave it empty or null - never guess.
- Never invent OAuth scopes, approval/verification requirements, or wait-time estimates.
- estimated_external_wait_days means time waiting on the PROVIDER (e.g. a review), not setup time.
- approval_status: "required" or "not_required" only when the excerpts say so explicitly;
  otherwise "unknown".
- recommended_setup_path answers "should a developer register their own ('custom') OAuth app,
  or would a managed OAuth app from a third-party auth aggregator be enough ('managed')?".
  Recommend "custom" when registration is self-serve/fast (most cases) since it gives full
  control over branding. Recommend "managed" only when the excerpts show custom registration
  is unusually slow or requires provider approval, making a pre-approved managed app the
  faster path. Use "unknown" whenever the excerpts don't give you enough to judge either way -
  this field is a judgment call, so default to "unknown" rather than guessing.
- category is a short 2-3 word label for what the product is (e.g. "Code hosting",
  "Team communication", "Issue tracking") - a description of the PRODUCT, not the OAuth setup.
- If the developer describes what their integration will do, use it only to prioritize which
  scopes to list (narrower, more relevant scopes) - never to invent facts the excerpts don't support.
- Respond with ONLY a JSON object matching the given schema. No prose, no markdown fences.
"""

EXTRACTION_SCHEMA_HINT = {
    "category": "string, 2-3 words describing the product",
    "summary": "string, 1-3 sentences",
    "recommended_setup_path": "one of: managed, custom, unknown",
    "setup_complexity": "one of: low, medium, high",
    "estimated_hands_on_setup_hours": "number >= 0",
    "estimated_external_wait_days": "number >= 0, or null if no external wait is documented",
    "approval_status": "one of: required, not_required, unknown",
    "prerequisites": ["string"],
    "redirect_uri_requirements": "string",
    "required_scopes": ["string"],
    "setup_steps": [
        {"title": "string", "instructions": "string", "responsible_party": "developer|provider|agent"}
    ],
    "blockers": ["string, a short description of a common problem"],
    "recovery_actions": [
        {
            "for_blocker": "string, must match one of the blockers above",
            "recovery_step": "string",
            "next_action": "string",
            "responsible_party": "developer|provider|agent",
        }
    ],
    "unknowns": ["string, things the excerpts did not cover"],
}


def extract_requirements(
    provider_name: str, canonical_domain: str, pages: list[dict], intended_use: str | None = None
) -> dict:
    """
    Ask TarqaAI to turn fetched documentation pages into structured OAuth
    setup data. `pages` is a list of {"url": str, "title": str, "excerpt": str}.
    `intended_use` is an optional, free-text description of what the
    developer's integration will do, used only to prioritize which scopes
    to surface (see EXTRACTION_SYSTEM_PROMPT) - never as a source of facts.

    Returns a plain dict shaped like the non-identity fields of OAuthGuide.
    Raises LLMError on any failure (timeout, bad JSON, API error, no evidence)
    so the caller can show a clear error instead of a fake guide.
    """
    if not pages:
        raise LLMError("No documentation pages were fetched, so there is no evidence to extract from.")

    evidence_text = "\n\n".join(
        f"SOURCE [{i}] {page['title']} ({page['url']})\n{page['excerpt']}" for i, page in enumerate(pages)
    )

    intended_use_line = f"\n\nThe developer's integration will: {intended_use.strip()}" if intended_use else ""

    user_prompt = (
        f"Provider: {provider_name} ({canonical_domain}){intended_use_line}\n\n"
        f"JSON schema to follow:\n{json.dumps(EXTRACTION_SCHEMA_HINT, indent=2)}\n\n"
        f"Documentation excerpts:\n{evidence_text}"
    )

    client = _client()
    messages = [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    failures = []
    for model in _candidate_models():
        try:
            response = client.chat.completions.create(model=model, messages=messages, temperature=0)
        except APITimeoutError:
            failures.append(f"{model}: timed out")
            continue
        except APIError as exc:
            failures.append(f"{model}: {exc}")
            continue
        except Exception as exc:
            failures.append(f"{model}: {exc}")
            continue

        raw_text = (response.choices[0].message.content or "").strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.strip("`")
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]

        # A model can answer without erroring and still return unusable
        # output (empty, truncated, or non-JSON prose) - that must fall
        # through to the next candidate model too, not just API errors.
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError as exc:
            failures.append(f"{model}: did not return valid JSON ({exc})")
            continue

    raise LLMError("All configured TarqaAI models failed - " + "; ".join(failures))
