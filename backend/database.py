"""
SQLite persistence for OAuth guides.

Design choice: each guide is stored as ONE row with its full data serialized
as JSON in a single column, instead of splitting steps/sources/blockers into
their own tables with foreign keys. A guide is always read and written as a
whole (Pydantic validates the whole object both ways), so normalizing it
into multiple tables would add joins without adding any real benefit here.

The one place we need to update a single field inside a guide - marking a
setup step as complete - is handled by reading the guide, changing that one
step in memory, and writing the whole guide back.
"""

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from guide_schema import OAuthGuide

DATABASE_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "oauth_launchpad.db"))


@contextmanager
def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    """Create the guides table if it doesn't already exist. Safe to call every startup."""
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS guides (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def save_guide(guide: OAuthGuide) -> None:
    """Insert a new guide, or overwrite it if a guide with the same id already exists."""
    now = datetime.now(timezone.utc).isoformat()
    data = guide.model_dump_json()
    with get_connection() as conn:
        existing = conn.execute("SELECT created_at FROM guides WHERE id = ?", (guide.id,)).fetchone()
        created_at = existing[0] if existing else now
        conn.execute(
            """
            INSERT INTO guides (id, data, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
            """,
            (guide.id, data, created_at, now),
        )


def get_guide(guide_id: str) -> OAuthGuide | None:
    with get_connection() as conn:
        row = conn.execute("SELECT data FROM guides WHERE id = ?", (guide_id,)).fetchone()
    if row is None:
        return None
    return OAuthGuide.model_validate(json.loads(row[0]))


def list_guides() -> list[OAuthGuide]:
    with get_connection() as conn:
        rows = conn.execute("SELECT data FROM guides").fetchall()
    guides = [OAuthGuide.model_validate(json.loads(row[0])) for row in rows]
    return sorted(guides, key=lambda g: g.provider_name.lower())


def _normalize_domain(domain: str) -> str:
    return domain.lower().removeprefix("www.")


def find_guide_by_domain(canonical_domain: str) -> OAuthGuide | None:
    """Look up an existing guide by canonical domain (case-insensitive,
    ignoring a leading "www."). Used so generating a guide for a provider
    that's already been researched reuses the existing guide instead of
    creating a duplicate."""
    target = _normalize_domain(canonical_domain)
    for guide in list_guides():
        if _normalize_domain(guide.canonical_domain) == target:
            return guide
    return None


def delete_guide(guide_id: str) -> bool:
    """Delete one guide by id. Returns True if a row was actually deleted."""
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM guides WHERE id = ?", (guide_id,))
    return cursor.rowcount > 0


def delete_duplicate_guides() -> list[str]:
    """Find guides that share a canonical domain - leftovers from before
    duplicate-prevention existed, or from identify_provider mistakes that
    have since been re-checked under the correct domain - and delete all
    but the oldest one per domain. Returns the ids that were deleted."""
    with get_connection() as conn:
        rows = conn.execute("SELECT id, data, created_at FROM guides").fetchall()

    by_domain: dict[str, list[tuple[str, str]]] = {}
    for guide_id, data, created_at in rows:
        domain = _normalize_domain(json.loads(data)["canonical_domain"])
        by_domain.setdefault(domain, []).append((guide_id, created_at))

    to_delete = []
    for entries in by_domain.values():
        if len(entries) <= 1:
            continue
        entries.sort(key=lambda entry: entry[1])  # oldest created_at first
        to_delete.extend(guide_id for guide_id, _ in entries[1:])

    if to_delete:
        with get_connection() as conn:
            conn.executemany("DELETE FROM guides WHERE id = ?", [(gid,) for gid in to_delete])

    return to_delete


def update_step_completion(guide_id: str, step_id: str, completed: bool) -> OAuthGuide | None:
    """Flip one setup step's completed flag and persist the whole guide. Returns the
    updated guide, or None if the guide or step doesn't exist."""
    guide = get_guide(guide_id)
    if guide is None:
        return None

    step_found = False
    for step in guide.setup_steps:
        if step.id == step_id:
            step.completed = completed
            step_found = True
            break

    if not step_found:
        return None

    save_guide(guide)
    return guide
