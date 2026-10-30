"""
FastAPI app for OAuth Launchpad.

  GET   /api/health
  GET   /api/apps
  GET   /api/guides/{id}
  POST  /api/guides/generate        (streams research progress, then the guide)
  PATCH /api/guides/{id}/steps/{step_id}
  POST  /api/guides/{id}/recheck    (re-researches an existing guide in place)
  POST  /api/admin/dedupe-guides    (admin-only; see its docstring)
"""

import json
import os

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import database
import research
from guide_schema import OAuthGuide
from seed_data import seed_if_empty

app = FastAPI(title="OAuth Launchpad API")

# Comma-separated list of allowed frontend origins, e.g.
# "https://oauth-launchpad.vercel.app,https://oauth-launchpad-git-preview.vercel.app".
# Defaults to local dev only, so a deployment that forgets to set this fails
# closed (CORS errors) rather than silently allowing every origin.
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _allowed_origins.split(",") if origin.strip()],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    database.init_db()
    seed_if_empty()


class AppSummary(BaseModel):
    """The small amount of info shown in the home-page guide list."""

    id: str
    provider_name: str
    canonical_domain: str
    category: str
    setup_complexity: str
    estimated_hands_on_setup_hours: float
    approval_status: str


def _to_summary(guide: OAuthGuide) -> AppSummary:
    return AppSummary(
        id=guide.id,
        provider_name=guide.provider_name,
        canonical_domain=guide.canonical_domain,
        category=guide.category,
        setup_complexity=guide.setup_complexity.value,
        estimated_hands_on_setup_hours=guide.estimated_hands_on_setup_hours,
        approval_status=guide.approval_status.value,
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/apps", response_model=list[AppSummary])
def list_apps(q: str | None = None):
    guides = database.list_guides()
    if q:
        needle = q.strip().lower()
        guides = [
            g for g in guides if needle in g.provider_name.lower() or needle in g.canonical_domain.lower()
        ]
    return [_to_summary(g) for g in guides]


@app.get("/api/guides/{guide_id}", response_model=OAuthGuide)
def get_guide(guide_id: str):
    guide = database.get_guide(guide_id)
    if guide is None:
        raise HTTPException(status_code=404, detail=f"No guide found with id '{guide_id}'.")
    return guide


class GenerateGuideRequest(BaseModel):
    app_name_or_website: str
    intended_use: str | None = None


@app.post("/api/guides/generate")
async def generate_guide(request: GenerateGuideRequest):
    """
    Streams newline-delimited JSON progress events as the research pipeline
    runs, ending with either {"stage": "complete", "guide": {...}} or an
    event with "status": "error". Streaming (instead of one big response at
    the end) is what lets the frontend show real, stage-by-stage progress.
    """

    async def event_stream():
        async for event in research.run_pipeline(request.app_name_or_website, intended_use=request.intended_use):
            yield json.dumps(event) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


@app.post("/api/guides/{guide_id}/recheck", response_model=OAuthGuide)
async def recheck_guide(guide_id: str):
    """Re-runs research against the guide's existing canonical domain and
    overwrites it in place, so "Re-check sources" reflects current docs
    without changing the guide's id or share link."""
    existing = database.get_guide(guide_id)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"No guide found with id '{guide_id}'.")

    guide = None
    async for event in research.run_pipeline(
        existing.canonical_domain, existing_id=guide_id, known_provider_name=existing.provider_name
    ):
        if event.get("status") == "error":
            raise HTTPException(status_code=502, detail=event.get("message", "Re-check failed."))
        if event.get("stage") == "complete":
            guide = event["guide"]

    return guide


@app.post("/api/admin/dedupe-guides")
def dedupe_guides(x_admin_token: str | None = Header(default=None)):
    """Deletes leftover duplicate guides (same canonical domain, created
    before generate_guide started reusing an existing guide instead of
    creating a new one - or from an identify_provider mistake that's since
    been corrected) and keeps the oldest guide per domain.

    Requires the ADMIN_TOKEN env var to be set and match the
    X-Admin-Token header - there's no user system in this app, so this
    guards the one destructive admin action that exists against being
    world-writable. If ADMIN_TOKEN isn't set, this endpoint always 403s
    (fails closed) rather than being quietly open.
    """
    admin_token = os.environ.get("ADMIN_TOKEN")
    if not admin_token or x_admin_token != admin_token:
        raise HTTPException(status_code=403, detail="Not authorized.")

    deleted_ids = database.delete_duplicate_guides()
    return {"deleted_ids": deleted_ids, "deleted_count": len(deleted_ids)}


class UpdateStepRequest(BaseModel):
    completed: bool


@app.patch("/api/guides/{guide_id}/steps/{step_id}", response_model=OAuthGuide)
def update_step(guide_id: str, step_id: str, request: UpdateStepRequest):
    guide = database.update_step_completion(guide_id, step_id, request.completed)
    if guide is None:
        raise HTTPException(
            status_code=404, detail=f"No step '{step_id}' found on guide '{guide_id}'."
        )
    return guide
