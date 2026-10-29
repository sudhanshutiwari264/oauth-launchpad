"""
Tests for the FastAPI app in main.py, using FastAPI's TestClient (no real
server process, no network). Each test points the database at a fresh temp
file. The generate-guide test replaces research.run_pipeline with a fake
async generator so it doesn't depend on Parallel or TarqaAI being reachable.
"""

import json

import database
import main
from fastapi.testclient import TestClient


def _client(monkeypatch, tmp_path, name="test.db"):
    monkeypatch.setattr(database, "DATABASE_PATH", str(tmp_path / name))
    return TestClient(main.app)


def test_health(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_apps_lists_seeded_guides(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        apps = client.get("/api/apps").json()
        ids = {a["id"] for a in apps}
        assert {"github", "slack", "google"} <= ids


def test_apps_search_filters_by_name(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        apps = client.get("/api/apps", params={"q": "slack"}).json()
        assert [a["id"] for a in apps] == ["slack"]


def test_get_guide_returns_full_detail(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        guide = client.get("/api/guides/github").json()
        assert guide["provider_name"] == "GitHub"
        assert len(guide["setup_steps"]) > 0


def test_get_missing_guide_returns_404(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        response = client.get("/api/guides/does-not-exist")
        assert response.status_code == 404


def test_patch_step_persists_across_requests(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        response = client.patch("/api/guides/github/steps/step-1", json={"completed": True})
        assert response.status_code == 200
        assert response.json()["setup_steps"][0]["completed"] is True

        again = client.get("/api/guides/github").json()
        assert again["setup_steps"][0]["completed"] is True


def test_patch_missing_step_returns_404(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        response = client.patch("/api/guides/github/steps/nope", json={"completed": True})
        assert response.status_code == 404


def test_generate_streams_progress_then_final_guide(monkeypatch, tmp_path):
    async def fake_pipeline(app_name_or_website, existing_id=None, intended_use=None, known_provider_name=None):
        yield {"stage": "identify_provider", "label": "Identifying the provider", "status": "running"}
        yield {"stage": "identify_provider", "label": "Identifying the provider", "status": "done"}
        yield {"stage": "complete", "status": "done", "guide": {"id": "fake-guide"}}

    monkeypatch.setattr(main.research, "run_pipeline", fake_pipeline)

    with _client(monkeypatch, tmp_path) as client:
        response = client.post("/api/guides/generate", json={"app_name_or_website": "example.com"})
        assert response.status_code == 200
        lines = [json.loads(line) for line in response.text.strip().splitlines()]
        assert lines[0]["stage"] == "identify_provider"
        assert lines[-1]["stage"] == "complete"
        assert lines[-1]["guide"]["id"] == "fake-guide"


def test_generate_streams_error_event_on_failure(monkeypatch, tmp_path):
    async def failing_pipeline(app_name_or_website, existing_id=None, intended_use=None, known_provider_name=None):
        yield {"stage": "identify_provider", "label": "Identifying the provider", "status": "running"}
        yield {"stage": "identify_provider", "label": "Identifying the provider", "status": "error", "message": "boom"}

    monkeypatch.setattr(main.research, "run_pipeline", failing_pipeline)

    with _client(monkeypatch, tmp_path) as client:
        response = client.post("/api/guides/generate", json={"app_name_or_website": "whatever"})
        lines = [json.loads(line) for line in response.text.strip().splitlines()]
        assert lines[-1]["status"] == "error"
        assert lines[-1]["message"] == "boom"


def test_recheck_passes_existing_id_and_provider_name_through(monkeypatch, tmp_path):
    """Re-checking must keep the guide's id and its existing provider_name
    (not re-derive the name from the domain - see research.identify_provider's
    known_provider_name docstring for why that would silently corrupt it)."""
    captured = {}

    with _client(monkeypatch, tmp_path) as client:
        # A real, complete guide dict (not a stub) so the endpoint's
        # response_model=OAuthGuide validation has something valid to
        # serialize - the fake only needs to prove what it was *called*
        # with, not simulate a fresh research result.
        unchanged_guide = database.get_guide("github").model_dump(mode="json")

        async def fake_pipeline(app_name_or_website, existing_id=None, intended_use=None, known_provider_name=None):
            captured["app_name_or_website"] = app_name_or_website
            captured["existing_id"] = existing_id
            captured["known_provider_name"] = known_provider_name
            yield {"stage": "complete", "status": "done", "guide": unchanged_guide}

        monkeypatch.setattr(main.research, "run_pipeline", fake_pipeline)

        response = client.post("/api/guides/github/recheck")
        assert response.status_code == 200

    assert captured["app_name_or_website"] == "github.com"
    assert captured["existing_id"] == "github"
    assert captured["known_provider_name"] == "GitHub"


def test_recheck_missing_guide_returns_404(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        response = client.post("/api/guides/does-not-exist/recheck")
        assert response.status_code == 404


def test_recheck_surfaces_pipeline_error_as_502(monkeypatch, tmp_path):
    async def failing_pipeline(app_name_or_website, existing_id=None, intended_use=None, known_provider_name=None):
        yield {"stage": "search_documentation", "status": "error", "message": "no docs found"}

    monkeypatch.setattr(main.research, "run_pipeline", failing_pipeline)

    with _client(monkeypatch, tmp_path) as client:
        response = client.post("/api/guides/github/recheck")
        assert response.status_code == 502
        assert response.json()["detail"] == "no docs found"
