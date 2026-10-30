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


def _make_guide(guide_id="test-guide", canonical_domain="testapp.com") -> OAuthGuide:
    return OAuthGuide(
        id=guide_id,
        provider_name="TestApp",
        canonical_domain=canonical_domain,
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


def test_find_guide_by_domain_matches_case_and_www_insensitively(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    database.save_guide(_make_guide("test-guide", canonical_domain="www.TestApp.com"))

    found = database.find_guide_by_domain("testapp.com")
    assert found is not None
    assert found.id == "test-guide"


def test_find_guide_by_domain_returns_none_when_no_match(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    database.save_guide(_make_guide("test-guide", canonical_domain="testapp.com"))

    assert database.find_guide_by_domain("somethingelse.com") is None


def test_delete_guide_removes_row_and_reports_success(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    database.save_guide(_make_guide())

    assert database.delete_guide("test-guide") is True
    assert database.get_guide("test-guide") is None
    assert database.delete_guide("test-guide") is False


def _set_created_at(monkeypatch, tmp_path, guide_id: str, created_at: str):
    with database.get_connection() as conn:
        conn.execute("UPDATE guides SET created_at = ? WHERE id = ?", (created_at, guide_id))


def test_delete_duplicate_guides_keeps_oldest_per_domain(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    database.save_guide(_make_guide("dup-newest", canonical_domain="dup.com"))
    database.save_guide(_make_guide("dup-oldest", canonical_domain="www.dup.com"))
    database.save_guide(_make_guide("dup-middle", canonical_domain="dup.com"))
    database.save_guide(_make_guide("unique-guide", canonical_domain="unique.com"))

    _set_created_at(monkeypatch, tmp_path, "dup-newest", "2026-01-03T00:00:00+00:00")
    _set_created_at(monkeypatch, tmp_path, "dup-oldest", "2026-01-01T00:00:00+00:00")
    _set_created_at(monkeypatch, tmp_path, "dup-middle", "2026-01-02T00:00:00+00:00")

    deleted = database.delete_duplicate_guides()

    assert set(deleted) == {"dup-newest", "dup-middle"}
    remaining_ids = {g.id for g in database.list_guides()}
    assert remaining_ids == {"dup-oldest", "unique-guide"}


def test_delete_duplicate_guides_is_a_no_op_when_nothing_duplicated(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    database.save_guide(_make_guide("guide-a", canonical_domain="a.com"))
    database.save_guide(_make_guide("guide-b", canonical_domain="b.com"))

    assert database.delete_duplicate_guides() == []
    assert len(database.list_guides()) == 2
