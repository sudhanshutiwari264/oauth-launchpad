"""
The research pipeline: a plain sequence of functions, run one after another.

identify_provider -> search_documentation -> fetch_documentation
    -> extract_requirements -> validate_findings -> generate_guide -> save_guide

Each function does one real piece of work (a Tavily call, a TarqaAI
call, or a validation/assembly step). `run_pipeline` below calls them in
order and yields a progress event after each one, so the frontend can show
real research progress instead of a fake loading animation.
"""

import asyncio
import json
import re
import uuid
from collections import Counter
from datetime import datetime, timezone
from urllib.parse import urlparse

import database
import llm
import tavily_client
from guide_schema import (
    ApprovalStatus,
    OAuthGuide,
    RecoveryAction,
    ResponsibleParty,
    SetupComplexity,
    SetupPath,
    SetupStep,
    SourceEvidence,
    VerificationStatus,
    is_safe_public_url,
)
from pydantic import ValidationError

MAX_SEARCH_RESULTS = 8
MAX_PAGES_TO_FETCH = 5

# Third-party platforms that commonly outrank a smaller company's own site in
# search results (e.g. its LinkedIn page). If identify_provider picked one of
# these as the "official" domain, it would end up researching the platform's
# OAuth instead of the actual provider's.
THIRD_PARTY_PLATFORM_DOMAINS = {
    "linkedin.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "youtube.com",
    "crunchbase.com",
    "wikipedia.org",
    "g2.com",
    "producthunt.com",
}


def _is_third_party_platform(hostname: str | None) -> bool:
    if not hostname:
        return False
    hostname = hostname.lower()
    return any(
        hostname == domain or hostname.endswith(f".{domain}") for domain in THIRD_PARTY_PLATFORM_DOMAINS
    )


class ResearchError(Exception):
    """Raised when a pipeline stage can't produce a usable result."""

    def __init__(self, stage: str, message: str):
        self.stage = stage
        super().__init__(message)


# --- Parsing Tavily's responses -------------------------------------------
# Tavily's web_search/web_fetch calls return a JSON string. We treat that
# content as untrusted web data: parse it defensively, and drop any result
# whose URL isn't a safe public http(s) address before we ever use it.

def _parse_search_results(raw: str) -> list[dict]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    parsed = []
    for result in data.get("results", []):
        url = result.get("url")
        if not url or not is_safe_public_url(url):
            continue
        excerpts = result.get("excerpts") or []
        parsed.append(
            {
                "url": url,
                "title": result.get("title") or url,
                "excerpt": "\n".join(excerpts)[:4000],
            }
        )
    return parsed


def _parse_fetch_results(raw: str) -> list[dict]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    parsed = []
    for result in data.get("results", []):
        url = result.get("url")
        if not url or not is_safe_public_url(url):
            continue
        text = result.get("full_content") or "\n".join(result.get("excerpts") or [])
        if not text:
            continue
        parsed.append({"url": url, "title": result.get("title") or url, "excerpt": text[:6000]})
    return parsed


# --- Pipeline stages ------------------------------------------------------

async def identify_provider(app_name_or_website: str, known_provider_name: str | None = None) -> dict:
    """Work out a provider's display name and canonical domain from free-form input.

    If the input already looks like a URL or domain, we trust it directly
    (after a safety check). Otherwise we ask Tavily to search for the
    official site - we never guess a domain out of thin air.

    `known_provider_name` is set when re-checking an already-researched
    guide (see run_pipeline's `existing_id`): the domain is already known,
    so there's no name to search for, and naively title-casing the domain's
    first label (e.g. "github.com" -> "Github") would quietly corrupt a
    correct name on every re-check. Passing the guide's existing name
    through avoids that.
    """
    candidate = app_name_or_website.strip()
    if not candidate:
        raise ResearchError("identify_provider", "Please enter an app name or website.")

    looks_like_url_or_domain = candidate.startswith(("http://", "https://")) or (
        "." in candidate and " " not in candidate
    )
    if looks_like_url_or_domain:
        url = candidate if candidate.startswith(("http://", "https://")) else f"https://{candidate}"
        domain = urlparse(url).hostname or ""
        if not domain or not is_safe_public_url(url):
            raise ResearchError("identify_provider", f"'{app_name_or_website}' isn't a public website we can research.")
        provider_name = known_provider_name or domain.split(".")[0].replace("-", " ").title()
        return {"provider_name": provider_name, "canonical_domain": domain}

    try:
        raw = await tavily_client.web_search(
            objective=f"Find the single official website domain for the software product named '{candidate}'",
            search_queries=[f"{candidate} official website", f"{candidate} developer platform"],
        )
    except tavily_client.TavilyError as exc:
        raise ResearchError("identify_provider", str(exc)) from exc
    results = _parse_search_results(raw)
    if not results:
        raise ResearchError("identify_provider", f"Could not find an official website for '{candidate}'.")

    candidates = [r for r in results if not _is_third_party_platform(urlparse(r["url"]).hostname)]
    if not candidates:
        raise ResearchError(
            "identify_provider",
            f"Could not find an official website for '{candidate}' (only third-party listings were found).",
        )

    # A large, unrelated site (a popular docs hub, a Q&A site) can rank
    # well for a generic "<name> developer platform" search without being
    # related to the candidate at all - the third-party blocklist above
    # only catches known social/directory platforms, not this. Require the
    # chosen domain to actually contain the candidate's name (the same
    # signal _prioritize_own_domain and _correct_domain_from_pages already
    # use downstream) rather than trusting raw search ranking; confidently
    # researching the wrong product's OAuth setup is worse than failing
    # and asking the developer to paste the website directly.
    own_domain_match = next(
        (r for r in candidates if _looks_like_providers_own_domain(urlparse(r["url"]).hostname, candidate)),
        None,
    )
    if not own_domain_match:
        raise ResearchError(
            "identify_provider",
            f"Could not confidently identify '{candidate}'s official website from search results - "
            "try pasting its website directly instead.",
        )
    domain = urlparse(own_domain_match["url"]).hostname
    return {"provider_name": candidate.strip().title(), "canonical_domain": domain}


async def search_documentation(provider_name: str, canonical_domain: str) -> list[dict]:
    """Search for the provider's official OAuth/developer documentation."""
    try:
        raw = await tavily_client.web_search(
            objective=f"Find official developer documentation for registering and configuring an OAuth app with {provider_name}",
            search_queries=[
                f"{provider_name} oauth documentation",
                f"{provider_name} developer oauth setup",
                f"site:{canonical_domain} oauth",
            ],
        )
    except tavily_client.TavilyError as exc:
        raise ResearchError("search_documentation", str(exc)) from exc

    results = _parse_search_results(raw)[:MAX_SEARCH_RESULTS]
    if not results:
        raise ResearchError("search_documentation", f"No documentation could be found for {provider_name}.")
    return _prioritize_own_domain(results, provider_name)


async def fetch_documentation(search_results: list[dict]) -> list[dict]:
    """Fetch the actual page content for the most relevant search results."""
    urls = [result["url"] for result in search_results[:MAX_PAGES_TO_FETCH]]
    try:
        raw = await tavily_client.web_fetch(
            urls=urls,
            objective="OAuth app setup requirements, scopes, redirect URIs, and approval process",
        )
    except tavily_client.TavilyError as exc:
        raise ResearchError("fetch_documentation", str(exc)) from exc

    pages = _parse_fetch_results(raw)
    if not pages:
        raise ResearchError("fetch_documentation", "Could not fetch content from the documentation pages found.")
    return pages


# A generic "<name> official website" search (used by identify_provider) is
# prone to picking up a directory/SEO site instead of the provider's own
# domain. The doc-specific searches in search_documentation are less prone to
# that, so if the pages actually fetched agree on one domain, trust that over
# identify_provider's original guess.
MIN_DOMAIN_CONSENSUS = 2


def _looks_like_providers_own_domain(hostname: str | None, provider_name: str) -> bool:
    """True if `hostname` contains the provider's name, e.g. "linear.app" or
    "developers.linear.app" for provider "Linear". This is scoped to results
    from the OAuth-doc-specific search (not the broader "official website"
    search, which can match unrelated same-named companies), so it's a
    fairly safe signal that the result is the provider's own site rather
    than a third-party integration guide or directory listing."""
    if not hostname:
        return False
    normalized_host = re.sub(r"[^a-z0-9]", "", hostname.lower())
    normalized_name = re.sub(r"[^a-z0-9]", "", provider_name.lower())
    return bool(normalized_name) and normalized_name in normalized_host


def _prioritize_own_domain(results: list[dict], provider_name: str) -> list[dict]:
    """Tavily's ranking alone isn't reliable at surfacing the provider's own
    docs - a well-SEO'd third-party directory can outrank them, and
    fetch_documentation only fetches the first MAX_PAGES_TO_FETCH results.
    Move likely-own-domain results to the front (stable within each group)
    so they don't get truncated away before they even get a chance to be
    fetched and counted in _correct_domain_from_pages."""
    own_domain = [r for r in results if _looks_like_providers_own_domain(urlparse(r["url"]).hostname, provider_name)]
    other = [r for r in results if r not in own_domain]
    return own_domain + other


def _correct_domain_from_pages(canonical_domain: str, pages: list[dict], provider_name: str) -> str:
    normalized_canonical = canonical_domain.lower().removeprefix("www.")
    hostnames = [
        hostname.lower().removeprefix("www.")
        for hostname in (urlparse(page["url"]).hostname for page in pages)
        if hostname and not _is_third_party_platform(hostname)
    ]
    if not hostnames:
        return canonical_domain

    # Strongest signal: a fetched page's own hostname contains the
    # provider's name (e.g. "linear.app" for "Linear"). A single such hit
    # outweighs a directory/SEO site that happened to rank first in the
    # original, generic "official website" search.
    own_domain_hit = next((h for h in hostnames if _looks_like_providers_own_domain(h, provider_name)), None)
    if own_domain_hit and own_domain_hit != normalized_canonical:
        return own_domain_hit

    best_domain, count = Counter(hostnames).most_common(1)[0]
    if count >= MIN_DOMAIN_CONSENSUS and best_domain != normalized_canonical:
        return best_domain
    return canonical_domain


def extract_requirements(
    provider_name: str, canonical_domain: str, pages: list[dict], intended_use: str | None = None
) -> dict:
    """Ask TarqaAI to turn fetched pages into structured OAuth setup data."""
    try:
        return llm.extract_requirements(provider_name, canonical_domain, pages, intended_use)
    except llm.LLMError as exc:
        raise ResearchError("extract_requirements", str(exc)) from exc


def validate_findings(canonical_domain: str, extracted: dict, pages: list[dict]) -> dict:
    """Attach sources to what was found, and flag anything notably missing.

    Every fetched page becomes a SourceEvidence entry. A page is marked
    "verified" only when it was actually served from the provider's own
    domain; anything else (a third-party tutorial, for example) is marked
    "unverified" even though we did fetch it.
    """
    sources = []
    for page in pages:
        page_domain = urlparse(page["url"]).hostname or ""
        verification_status = (
            VerificationStatus.verified
            if canonical_domain.lower() in page_domain.lower()
            else VerificationStatus.unverified
        )
        sources.append(
            SourceEvidence(
                title=page["title"],
                url=page["url"],
                supports_claim="OAuth app setup requirements",
                verification_status=verification_status,
            )
        )

    unknowns = list(extracted.get("unknowns") or [])
    if not extracted.get("required_scopes"):
        unknowns.append("No specific OAuth scopes were found in the documentation reviewed.")
    if extracted.get("approval_status", "unknown") == "unknown":
        unknowns.append("Whether provider approval/verification is required could not be confirmed.")
    if extracted.get("recommended_setup_path", "unknown") == "unknown":
        unknowns.append("Whether a managed OAuth option would be sufficient here could not be confirmed.")

    extracted["unknowns"] = unknowns
    extracted["sources"] = sources
    return extracted


def _coerce_responsible_party(value) -> ResponsibleParty:
    """The LLM is told to answer with only developer|provider|agent, but
    doesn't always comply (e.g. 'user', 'workspace owner'). Rather than
    crashing guide generation over a vocabulary slip, fall back to the
    party most setup steps already default to."""
    try:
        return ResponsibleParty(value)
    except ValueError:
        return ResponsibleParty.developer


def _coerce_setup_complexity(value) -> SetupComplexity:
    """setup_complexity only has low|medium|high - unlike approval_status
    or recommended_setup_path, it has no "unknown" member. The LLM
    sometimes answers "unknown" here anyway (borrowing the vocabulary of
    those other fields), which would otherwise crash generation over a
    vocabulary slip rather than a real lack of evidence."""
    try:
        return SetupComplexity(value)
    except ValueError:
        return SetupComplexity.medium


def _coerce_approval_status(value) -> ApprovalStatus:
    try:
        return ApprovalStatus(value)
    except ValueError:
        return ApprovalStatus.unknown


def _coerce_setup_path(value) -> SetupPath:
    try:
        return SetupPath(value)
    except ValueError:
        return SetupPath.unknown


def generate_guide(
    provider_name: str, canonical_domain: str, validated: dict, existing_id: str | None = None
) -> OAuthGuide:
    """Assemble and validate the final OAuthGuide from everything gathered so far.

    `existing_id` is set when re-checking an existing guide, so the
    refreshed guide overwrites it in place instead of creating a new one.
    """
    if existing_id:
        guide_id = existing_id
    else:
        slug = re.sub(r"[^a-z0-9]+", "-", provider_name.lower()).strip("-")
        guide_id = f"{slug}-{uuid.uuid4().hex[:6]}"

    try:
        steps = [
            SetupStep(
                id=f"step-{index + 1}",
                title=step.get("title", f"Step {index + 1}"),
                instructions=step.get("instructions", ""),
                responsible_party=_coerce_responsible_party(step.get("responsible_party", "developer")),
            )
            for index, step in enumerate(validated.get("setup_steps") or [])
        ]

        recovery_actions = [
            RecoveryAction(
                for_blocker=action.get("for_blocker", ""),
                recovery_step=action.get("recovery_step", ""),
                next_action=action.get("next_action", ""),
                responsible_party=_coerce_responsible_party(action.get("responsible_party", "developer")),
            )
            for action in (validated.get("recovery_actions") or [])
        ]

        return OAuthGuide(
            id=guide_id,
            provider_name=provider_name,
            canonical_domain=canonical_domain,
            category=validated.get("category") or "",
            summary=validated.get("summary") or f"OAuth setup guide for {provider_name}.",
            recommended_setup_path=_coerce_setup_path(validated.get("recommended_setup_path", "unknown")),
            setup_complexity=_coerce_setup_complexity(validated.get("setup_complexity", "medium")),
            estimated_hands_on_setup_hours=validated.get("estimated_hands_on_setup_hours") or 0,
            estimated_external_wait_days=validated.get("estimated_external_wait_days"),
            approval_status=_coerce_approval_status(validated.get("approval_status", "unknown")),
            prerequisites=validated.get("prerequisites") or [],
            redirect_uri_requirements=validated.get("redirect_uri_requirements") or "",
            required_scopes=validated.get("required_scopes") or [],
            setup_steps=steps,
            sources=validated["sources"],
            blockers=validated.get("blockers") or [],
            recovery_actions=recovery_actions,
            unknowns=validated.get("unknowns") or [],
            last_researched_at=datetime.now(timezone.utc),
        )
    except (ValidationError, ValueError) as exc:
        raise ResearchError("generate_guide", f"Generated guide failed validation: {exc}") from exc


def save_guide(guide: OAuthGuide) -> OAuthGuide:
    database.save_guide(guide)
    return guide


# --- Orchestration with progress events -----------------------------------

STAGE_LABELS = [
    ("identify_provider", "Identifying the provider"),
    ("search_documentation", "Searching official documentation"),
    ("fetch_documentation", "Fetching relevant pages"),
    ("extract_requirements", "Extracting OAuth requirements"),
    ("validate_and_generate", "Validating findings and generating the guide"),
]


async def run_pipeline(
    app_name_or_website: str,
    existing_id: str | None = None,
    intended_use: str | None = None,
    known_provider_name: str | None = None,
):
    """Run every stage in order, yielding a progress event after each one.

    Each event is a dict: {"stage", "label", "status": "running"|"done"|"error", ...}.
    On success, the final event is {"stage": "complete", "status": "done", "guide": {...}}.
    On failure, the pipeline stops and yields one event with "status": "error".

    `existing_id` re-runs research for an already-saved guide and overwrites
    it in place (used by the "re-check sources" action) instead of creating
    a new guide - pair it with `known_provider_name` (the guide's existing
    provider_name) so re-checking doesn't re-derive (and potentially
    corrupt) the name from the domain. `intended_use` is an optional
    free-text description of the developer's integration, passed through
    to help prioritize scopes.
    """
    identity = search_results = pages = extracted = validated = guide = None

    for stage_name, label in STAGE_LABELS:
        yield {"stage": stage_name, "label": label, "status": "running"}
        try:
            if stage_name == "identify_provider":
                identity = await identify_provider(app_name_or_website, known_provider_name=known_provider_name)
            elif stage_name == "search_documentation":
                search_results = await search_documentation(identity["provider_name"], identity["canonical_domain"])
            elif stage_name == "fetch_documentation":
                pages = await fetch_documentation(search_results)
                identity["canonical_domain"] = _correct_domain_from_pages(
                    identity["canonical_domain"], pages, identity["provider_name"]
                )
            elif stage_name == "extract_requirements":
                extracted = await asyncio.to_thread(
                    extract_requirements,
                    identity["provider_name"],
                    identity["canonical_domain"],
                    pages,
                    intended_use,
                )
            elif stage_name == "validate_and_generate":
                validated = validate_findings(identity["canonical_domain"], extracted, pages)
                guide = generate_guide(
                    identity["provider_name"], identity["canonical_domain"], validated, existing_id=existing_id
                )
                save_guide(guide)
        except ResearchError as exc:
            yield {"stage": stage_name, "label": label, "status": "error", "message": str(exc)}
            return

        yield {"stage": stage_name, "label": label, "status": "done"}

    yield {"stage": "complete", "status": "done", "guide": guide.model_dump(mode="json")}
