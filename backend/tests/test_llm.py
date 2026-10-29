"""
Tests for llm.py using a fake OpenAI client - no network calls, no real
TARQA_API_KEY needed. These check that we parse TarqaAI's response shape
correctly and fail cleanly when it doesn't cooperate.
"""

import pytest

import llm


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]


class _FakeCompletions:
    def __init__(self, content, fails_for_models=(), content_for_models=None):
        self._content = content
        self._fails_for_models = set(fails_for_models)
        self._content_for_models = content_for_models or {}

    def create(self, **kwargs):
        model = kwargs.get("model")
        if model in self._fails_for_models:
            raise RuntimeError(f"{model} is unavailable")
        return _FakeResponse(self._content_for_models.get(model, self._content))


class _FakeChat:
    def __init__(self, content, fails_for_models=(), content_for_models=None):
        self.completions = _FakeCompletions(content, fails_for_models, content_for_models)


class _FakeClient:
    def __init__(self, content, fails_for_models=(), content_for_models=None):
        self.chat = _FakeChat(content, fails_for_models, content_for_models)


def _fake_pages():
    return [{"url": "https://docs.github.com/en/apps/oauth-apps", "title": "OAuth apps", "excerpt": "..."}]


def test_extract_requirements_raises_when_no_pages():
    with pytest.raises(llm.LLMError):
        llm.extract_requirements("GitHub", "github.com", [])


def test_extract_requirements_parses_markdown_fenced_json(monkeypatch):
    monkeypatch.setattr(llm, "TARQA_MODEL", "fake-model")
    content = '```json\n{"summary": "hi", "scopes": []}\n```'
    monkeypatch.setattr(llm, "_client", lambda: _FakeClient(content))

    result = llm.extract_requirements("GitHub", "github.com", _fake_pages())
    assert result == {"summary": "hi", "scopes": []}


def test_extract_requirements_parses_plain_json(monkeypatch):
    monkeypatch.setattr(llm, "TARQA_MODEL", "fake-model")
    content = '{"summary": "hi", "scopes": ["repo"]}'
    monkeypatch.setattr(llm, "_client", lambda: _FakeClient(content))

    result = llm.extract_requirements("GitHub", "github.com", _fake_pages())
    assert result == {"summary": "hi", "scopes": ["repo"]}


def test_extract_requirements_raises_on_invalid_json(monkeypatch):
    monkeypatch.setattr(llm, "TARQA_MODEL", "fake-model")
    monkeypatch.setattr(llm, "_client", lambda: _FakeClient("not json at all"))

    with pytest.raises(llm.LLMError):
        llm.extract_requirements("GitHub", "github.com", _fake_pages())


def test_extract_requirements_falls_back_to_second_model(monkeypatch):
    """TarqaAI's own docs recommend trying a fallback model on failure - if the
    primary model errors, we should transparently retry with TARQA_MODEL2."""
    monkeypatch.setattr(llm, "TARQA_MODEL", "broken-model")
    monkeypatch.setattr(llm, "TARQA_MODEL_FALLBACK_2", "working-model")
    monkeypatch.setattr(llm, "TARQA_MODEL_FALLBACK_3", None)
    content = '{"summary": "from fallback", "scopes": []}'
    monkeypatch.setattr(llm, "_client", lambda: _FakeClient(content, fails_for_models={"broken-model"}))

    result = llm.extract_requirements("GitHub", "github.com", _fake_pages())
    assert result == {"summary": "from fallback", "scopes": []}


def test_extract_requirements_falls_back_when_model_returns_invalid_json(monkeypatch):
    """A model can answer without erroring and still return unusable output
    (seen in practice: empty string, truncated JSON). That must fall through
    to the next candidate model, not stop there and raise immediately."""
    monkeypatch.setattr(llm, "TARQA_MODEL", "flaky-model")
    monkeypatch.setattr(llm, "TARQA_MODEL_FALLBACK_2", "working-model")
    monkeypatch.setattr(llm, "TARQA_MODEL_FALLBACK_3", None)
    monkeypatch.setattr(
        llm,
        "_client",
        lambda: _FakeClient(
            content=None,
            content_for_models={
                "flaky-model": "",
                "working-model": '{"summary": "from second model", "scopes": []}',
            },
        ),
    )

    result = llm.extract_requirements("GitHub", "github.com", _fake_pages())
    assert result == {"summary": "from second model", "scopes": []}


def test_extract_requirements_raises_when_every_model_fails(monkeypatch):
    monkeypatch.setattr(llm, "TARQA_MODEL", "model-a")
    monkeypatch.setattr(llm, "TARQA_MODEL_FALLBACK_2", "model-b")
    monkeypatch.setattr(llm, "TARQA_MODEL_FALLBACK_3", None)
    monkeypatch.setattr(
        llm, "_client", lambda: _FakeClient("irrelevant", fails_for_models={"model-a", "model-b"})
    )

    with pytest.raises(llm.LLMError) as exc_info:
        llm.extract_requirements("GitHub", "github.com", _fake_pages())
    assert "model-a" in str(exc_info.value)
    assert "model-b" in str(exc_info.value)


def test_client_raises_when_api_key_missing(monkeypatch):
    monkeypatch.setattr(llm, "TARQA_API_KEY", None)
    with pytest.raises(llm.LLMError):
        llm._client()


def test_candidate_models_raises_when_primary_model_missing(monkeypatch):
    monkeypatch.setattr(llm, "TARQA_MODEL", None)
    with pytest.raises(llm.LLMError):
        llm._candidate_models()


def test_candidate_models_includes_configured_fallbacks(monkeypatch):
    monkeypatch.setattr(llm, "TARQA_MODEL", "model-a")
    monkeypatch.setattr(llm, "TARQA_MODEL_FALLBACK_2", "model-b")
    monkeypatch.setattr(llm, "TARQA_MODEL_FALLBACK_3", "model-c")
    assert llm._candidate_models() == ["model-a", "model-b", "model-c"]
