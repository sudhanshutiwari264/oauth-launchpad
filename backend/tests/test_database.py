"""
Tests for database.py. Each test points DATABASE_PATH at a fresh temp file
(via monkeypatch) so tests can't interfere with each other or with the real
oauth_launchpad.db used when running the app.
"""

from datetime import datetime, timezone

import database
from guide_schema import (
    ApprovalStatus,
    OAuthGuide,
    ResponsibleParty,
    SetupComplexity,
    SetupPath,
    SetupStep,
)


def _make_guide(guide_id="test-guide") -> OAuthGuide:
    return OAuthGuide(
        id=guide_id,
        provider_name="TestApp",
        canonical_domain="testapp.com",
        summary="A test guide.",
        recommended_setup_path=SetupPath.custom,
        setup_complexity=SetupComplexity.low,
        estimated_hands_on_setup_hours=1.0,
        approval_status=ApprovalStatus.not_required,
        setup_steps=[
            SetupStep(
                id="step-1",
                title="Do the thing",
                instructions="Just do it.",
                responsible_party=ResponsibleParty.developer,
            )
        ],
        last_researched_at=datetime.now(timezone.utc),
    )


def _use_temp_db(monkeypatch, tmp_path, name="test.db"):
    monkeypatch.setattr(database, "DATABASE_PATH", str(tmp_path / name))
    database.init_db()


def test_save_and_get_guide_roundtrip(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    guide = _make_guide()
    database.save_guide(guide)

    fetched = database.get_guide("test-guide")
    assert fetched is not None
    assert fetched.provider_name == "TestApp"
    assert fetched.setup_steps[0].id == "step-1"


def test_get_guide_returns_none_for_missing_id(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    assert database.get_guide("does-not-exist") is None


def test_list_guides_returns_all_saved_guides(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    database.save_guide(_make_guide("guide-a"))
    database.save_guide(_make_guide("guide-b"))

    ids = {g.id for g in database.list_guides()}
    assert ids == {"guide-a", "guide-b"}


def test_update_step_completion_persists_after_reload(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    database.save_guide(_make_guide())

    updated = database.update_step_completion("test-guide", "step-1", True)
    assert updated is not None
    assert updated.setup_steps[0].completed is True

    reloaded = database.get_guide("test-guide")
    assert reloaded.setup_steps[0].completed is True


def test_update_step_completion_returns_none_for_missing_guide(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    assert database.update_step_completion("does-not-exist", "step-1", True) is None


def test_update_step_completion_returns_none_for_missing_step(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    database.save_guide(_make_guide())
    assert database.update_step_completion("test-guide", "does-not-exist", True) is None


def test_save_guide_overwrites_existing_guide(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    database.save_guide(_make_guide())

    changed = _make_guide()
    changed.summary = "An updated summary."
    database.save_guide(changed)

    assert len(database.list_guides()) == 1
    assert database.get_guide("test-guide").summary == "An updated summary."
