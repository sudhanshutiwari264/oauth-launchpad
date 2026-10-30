"""
Tests for research.py. None of these touch the network - they test the
parsing, validation, and assembly logic in isolation, including how the
pipeline reacts when a stage fails.
"""

import asyncio
import json
from datetime import datetime, timezone

import database
import llm
import tavily_client
import pytest
import research
from guide_schema import OAuthGuide, ResponsibleParty, SetupComplexity, VerificationStatus


def test_parse_search_results_filters_unsafe_urls():
    raw = json.dumps(
        {
            "results": [
                {"url": "https://docs.github.com/x", "title": "Good", "excerpts": ["hello"]},
                {"url": "http://localhost/admin", "title": "Bad", "excerpts": ["nope"]},
            ]
        }
    )
    results = research._parse_search_results(raw)
    assert len(results) == 1
    assert results[0]["url"] == "https://docs.github.com/x"


def test_parse_search_results_handles_invalid_json():
    assert research._parse_search_results("not json") == []


def test_parse_fetch_results_prefers_full_content_over_excerpts():
    raw = json.dumps(
        {
            "results": [
                {
                    "url": "https://docs.github.com/x",
                    "title": "Doc",
                    "full_content": "FULL PAGE TEXT",
                    "excerpts": ["short excerpt"],
                }
            ]
        }
    )
    results = research._parse_fetch_results(raw)
    assert results[0]["excerpt"] == "FULL PAGE TEXT"


def test_identify_provider_accepts_direct_domain():
    identity = asyncio.run(research.identify_provider("github.com"))
    assert identity["canonical_domain"] == "github.com"


def test_identify_provider_rejects_localhost():
    with pytest.raises(research.ResearchError):
        asyncio.run(research.identify_provider("http://localhost:8000"))


def test_identify_provider_skips_third_party_platform_domains(monkeypatch):
    """If the top search result is a company's LinkedIn/Twitter page rather than
    its own site, we should skip it and use the next real result instead of
    researching the wrong company entirely (see README Known limitations)."""

    async def fake_web_search(objective, search_queries):
        return json.dumps(
            {
                "results": [
                    {"url": "https://www.linkedin.com/company/acme", "title": "Acme on LinkedIn", "excerpts": []},
                    {"url": "https://acme.dev/docs", "title": "Acme Developer Docs", "excerpts": []},
                ]
            }
        )

    monkeypatch.setattr(tavily_client, "web_search", fake_web_search)

    identity = asyncio.run(research.identify_provider("Acme"))
    assert identity["canonical_domain"] == "acme.dev"


def test_identify_provider_fails_when_only_third_party_results_found(monkeypatch):
    async def fake_web_search(objective, search_queries):
        return json.dumps(
            {"results": [{"url": "https://www.linkedin.com/company/acme", "title": "Acme on LinkedIn", "excerpts": []}]}
        )

    monkeypatch.setattr(tavily_client, "web_search", fake_web_search)

    with pytest.raises(research.ResearchError):
        asyncio.run(research.identify_provider("Acme"))


def test_identify_provider_rejects_empty_input():
    with pytest.raises(research.ResearchError):
        asyncio.run(research.identify_provider("   "))


def test_identify_provider_rejects_unrelated_high_ranking_domain(monkeypatch):
    """Reproduces a real production bug: a large, unrelated site (here,
    GitHub's own docs) can rank well for a generic "<name> developer
    platform" search without being related to the candidate at all - it
    isn't on the third-party blocklist, so the old code confidently
    researched the wrong product's OAuth setup entirely. Must fail instead
    of guessing."""

    async def fake_web_search(objective, search_queries):
        return json.dumps(
            {
                "results": [
                    {"url": "https://docs.github.com/en/some-unrelated-guide", "title": "A Guide", "excerpts": []},
                    {"url": "https://docs.github.com/en/another-guide", "title": "Another Guide", "excerpts": []},
                ]
            }
        )

    monkeypatch.setattr(tavily_client, "web_search", fake_web_search)

    with pytest.raises(research.ResearchError):
        asyncio.run(research.identify_provider("Zapier"))


def test_identify_provider_matches_multi_word_brand_to_parent_domain(monkeypatch):
    """Reproduces a real production bug: requiring the FULL candidate name
    as one substring rejects "Microsoft Teams" ever matching microsoft.com,
    since the product name doesn't literally appear in the parent brand's
    domain - even though Tavily correctly returns microsoft.com as the top
    result. A distinctive word from the name ("microsoft") must be enough."""

    async def fake_web_search(objective, search_queries):
        return json.dumps(
            {
                "results": [
                    {"url": "https://leadiq.com/c/microsoft-teams", "title": "Microsoft Teams on LeadIQ", "excerpts": []},
                    {"url": "https://www.microsoft.com/en-us/microsoft-teams/log-in", "title": "Microsoft Teams", "excerpts": []},
                ]
            }
        )

    monkeypatch.setattr(tavily_client, "web_search", fake_web_search)

    identity = asyncio.run(research.identify_provider("Microsoft Teams"))
    assert identity["canonical_domain"] == "www.microsoft.com"


def test_identify_provider_still_rejects_unrelated_domain_for_short_generic_word(monkeypatch):
    """The word-level fallback must not make matching too loose: a generic
    short word still shouldn't let an unrelated site through."""

    async def fake_web_search(objective, search_queries):
        return json.dumps(
            {"results": [{"url": "https://docs.uipath.com/teams-integration", "title": "Teams on UiPath", "excerpts": []}]}
        )

    monkeypatch.setattr(tavily_client, "web_search", fake_web_search)

    with pytest.raises(research.ResearchError):
        asyncio.run(research.identify_provider("Teams"))


def test_identify_provider_finds_name_match_even_if_not_first_result(monkeypatch):
    """The real official site doesn't have to be search result #1 - any
    result whose domain contains the candidate's name should be found."""

    async def fake_web_search(objective, search_queries):
        return json.dumps(
            {
                "results": [
                    {"url": "https://docs.github.com/en/unrelated", "title": "Unrelated", "excerpts": []},
                    {"url": "https://zapier.com/developer", "title": "Zapier Developer Platform", "excerpts": []},
                ]
            }
        )

    monkeypatch.setattr(tavily_client, "web_search", fake_web_search)

    identity = asyncio.run(research.identify_provider("Zapier"))
    assert identity["canonical_domain"] == "zapier.com"


def test_identify_provider_uses_known_provider_name_for_direct_domain():
    """For a re-check, naively title-casing the domain's first label would
    turn "GitHub" into "Github" - known_provider_name must override that."""
    identity = asyncio.run(research.identify_provider("github.com", known_provider_name="GitHub"))
    assert identity["provider_name"] == "GitHub"
    assert identity["canonical_domain"] == "github.com"


def test_identify_provider_wraps_parallel_mcp_error(monkeypatch):
    """A Tavily outage/rate-limit (TavilyError) must become a clean
    ResearchError, not an unhandled exception that crashes the whole stream."""

    async def failing_web_search(objective, search_queries):
        raise tavily_client.TavilyError("429 Too Many Requests")

    monkeypatch.setattr(tavily_client, "web_search", failing_web_search)

    with pytest.raises(research.ResearchError) as exc_info:
        asyncio.run(research.identify_provider("Acme"))
    assert exc_info.value.stage == "identify_provider"


def test_search_documentation_wraps_parallel_mcp_error(monkeypatch):
    async def failing_web_search(objective, search_queries):
        raise tavily_client.TavilyError("429 Too Many Requests")

    monkeypatch.setattr(tavily_client, "web_search", failing_web_search)

    with pytest.raises(research.ResearchError) as exc_info:
        asyncio.run(research.search_documentation("Acme", "acme.dev"))
    assert exc_info.value.stage == "search_documentation"


def test_fetch_documentation_wraps_parallel_mcp_error(monkeypatch):
    async def failing_web_fetch(urls, objective=None):
        raise tavily_client.TavilyError("timed out")

    monkeypatch.setattr(tavily_client, "web_fetch", failing_web_fetch)

    with pytest.raises(research.ResearchError) as exc_info:
        asyncio.run(research.fetch_documentation([{"url": "https://acme.dev/docs", "title": "Docs"}]))
    assert exc_info.value.stage == "fetch_documentation"


def test_extract_requirements_wraps_llm_error(monkeypatch):
    def boom(provider_name, canonical_domain, pages, intended_use=None):
        raise llm.LLMError("could not reach tarqa")

    monkeypatch.setattr(llm, "extract_requirements", boom)

    with pytest.raises(research.ResearchError) as exc_info:
        research.extract_requirements(
            "GitHub", "github.com", [{"url": "https://github.com", "title": "x", "excerpt": "y"}]
        )
    assert exc_info.value.stage == "extract_requirements"


def test_validate_findings_marks_official_domain_as_verified():
    pages = [{"url": "https://docs.github.com/apps", "title": "Docs", "excerpt": "..."}]
    extracted = {"required_scopes": ["repo"], "approval_status": "not_required"}
    validated = research.validate_findings("github.com", extracted, pages)
    assert validated["sources"][0].verification_status == VerificationStatus.verified


def test_validate_findings_marks_third_party_domain_as_unverified():
    pages = [{"url": "https://some-blog.example/tutorial", "title": "Tutorial", "excerpt": "..."}]
    extracted = {"required_scopes": ["repo"], "approval_status": "not_required"}
    validated = research.validate_findings("github.com", extracted, pages)
    assert validated["sources"][0].verification_status == VerificationStatus.unverified


def test_validate_findings_flags_missing_scopes_and_unknown_approval():
    pages = [{"url": "https://example.com/docs", "title": "Docs", "excerpt": "..."}]
    extracted = {"required_scopes": [], "approval_status": "unknown"}
    validated = research.validate_findings("example.com", extracted, pages)
    assert any("scope" in u.lower() for u in validated["unknowns"])
    assert any("approval" in u.lower() for u in validated["unknowns"])


def test_generate_guide_builds_valid_guide():
    validated = {
        "summary": "Test summary",
        "recommended_setup_path": "custom",
        "setup_complexity": "low",
        "estimated_hands_on_setup_hours": 2,
        "approval_status": "not_required",
        "required_scopes": ["read"],
        "setup_steps": [{"title": "Do it", "instructions": "Go here", "responsible_party": "developer"}],
        "blockers": [],
        "recovery_actions": [],
        "unknowns": [],
        "sources": [],
    }
    guide = research.generate_guide("TestApp", "testapp.com", validated)
    assert guide.provider_name == "TestApp"
    assert guide.setup_steps[0].title == "Do it"


def test_generate_guide_coerces_invalid_setup_complexity():
    """If the LLM returns a setup_complexity value outside low/medium/high
    (a vocabulary slip, same class of issue as responsible_party), we must
    not crash the whole research run over it - fall back to "medium" like
    _coerce_responsible_party falls back to "developer"."""
    validated = {
        "summary": "Test",
        "recommended_setup_path": "custom",
        "setup_complexity": "extreme",
        "estimated_hands_on_setup_hours": 2,
        "required_scopes": [],
        "setup_steps": [],
        "blockers": [],
        "recovery_actions": [],
        "unknowns": [],
        "sources": [],
    }
    guide = research.generate_guide("TestApp", "testapp.com", validated)
    assert guide.setup_complexity == SetupComplexity.medium


def test_run_pipeline_stops_and_yields_error_event(monkeypatch):
    """If an early stage fails, the pipeline must stop and yield exactly one
    error event instead of continuing to later stages."""

    async def failing_identify(app_name_or_website, known_provider_name=None):
        raise research.ResearchError("identify_provider", "no good")

    monkeypatch.setattr(research, "identify_provider", failing_identify)

    events = asyncio.run(_collect(research.run_pipeline("whatever")))

    assert events[-1]["status"] == "error"
    assert events[-1]["stage"] == "identify_provider"
    assert not any(e["stage"] == "search_documentation" for e in events)


def _save_existing_guide(monkeypatch, tmp_path, guide_id="existing-id", canonical_domain="acme.com"):
    monkeypatch.setattr(database, "DATABASE_PATH", str(tmp_path / "test.db"))
    database.init_db()
    database.save_guide(
        OAuthGuide(
            id=guide_id,
            provider_name="Acme",
            canonical_domain=canonical_domain,
            summary="Existing guide.",
            recommended_setup_path="custom",
            setup_complexity="low",
            estimated_hands_on_setup_hours=1.0,
            approval_status="not_required",
            last_researched_at=datetime.now(timezone.utc),
        )
    )


def test_run_pipeline_reuses_existing_guide_for_fresh_request(monkeypatch, tmp_path):
    """A fresh generate request for a domain that's already been researched
    must reuse the existing guide instead of running the rest of the
    pipeline and saving a duplicate."""
    _save_existing_guide(monkeypatch, tmp_path)

    async def fake_identify(app_name_or_website, known_provider_name=None):
        return {"provider_name": "Acme", "canonical_domain": "acme.com"}

    monkeypatch.setattr(research, "identify_provider", fake_identify)

    def must_not_run(*args, **kwargs):
        raise AssertionError("search_documentation must not run when an existing guide is reused")

    monkeypatch.setattr(research, "search_documentation", must_not_run)

    events = asyncio.run(_collect(research.run_pipeline("Acme")))

    assert events[-1]["stage"] == "complete"
    assert events[-1]["reused_existing"] is True
    assert events[-1]["guide"]["id"] == "existing-id"
    assert len(database.list_guides()) == 1  # no duplicate was saved


def test_run_pipeline_recheck_does_not_short_circuit_on_duplicate(monkeypatch, tmp_path):
    """A re-check (existing_id set) must always do the real research for
    that specific guide, even though a guide already exists on this
    domain - that's the point of a re-check, not a duplicate to avoid."""
    _save_existing_guide(monkeypatch, tmp_path)

    async def fake_identify(app_name_or_website, known_provider_name=None):
        return {"provider_name": "Acme", "canonical_domain": "acme.com"}

    monkeypatch.setattr(research, "identify_provider", fake_identify)

    search_was_called = False

    async def fake_search_documentation(provider_name, canonical_domain):
        nonlocal search_was_called
        search_was_called = True
        raise research.ResearchError("search_documentation", "stop here, that's enough for this test")

    monkeypatch.setattr(research, "search_documentation", fake_search_documentation)

    asyncio.run(_collect(research.run_pipeline("acme.com", existing_id="existing-id")))

    assert search_was_called


def test_is_third_party_platform_catches_subdomains():
    """A generic "official website" search can surface a subdomain of a
    skipped platform (e.g. Wikipedia's language subdomains), not just the
    bare domain - this must still be recognized as third-party."""
    assert research._is_third_party_platform("en.wikipedia.org")
    assert research._is_third_party_platform("www.linkedin.com")
    assert not research._is_third_party_platform("docs.discord.com")


def test_correct_domain_from_pages_overrides_on_strong_consensus():
    """If identify_provider's domain guess was wrong (e.g. a directory/SEO
    site outranked the real site), the pages actually fetched by the
    doc-specific search should override it when they agree."""
    pages = [
        {"url": "https://readthedocs.io/some-sdk/oauth.html"},
        {"url": "https://readthedocs.io/some-sdk/api-reference.html"},
        {"url": "https://github.com/example/oauth2-example"},
    ]
    assert research._correct_domain_from_pages("leadiq.com", pages, "Acme") == "readthedocs.io"


def test_correct_domain_from_pages_keeps_original_without_consensus():
    pages = [
        {"url": "https://github.com/example/sdk"},
        {"url": "https://nango.dev/docs/integrations/example"},
    ]
    assert research._correct_domain_from_pages("leadiq.com", pages, "Acme") == "leadiq.com"


def test_correct_domain_from_pages_ignores_third_party_platforms():
    pages = [
        {"url": "https://en.wikipedia.org/wiki/Example"},
        {"url": "https://en.wikipedia.org/wiki/Example_(company)"},
        {"url": "https://docs.example.com/oauth"},
    ]
    assert research._correct_domain_from_pages("example.com", pages, "Acme") == "example.com"


def test_correct_domain_from_pages_trusts_single_own_domain_hit():
    """A single fetched page hosted on a domain containing the provider's
    name is strong enough evidence to override the guess outright, even
    without another page agreeing - this is the Linear/Airtable case,
    where the real docs ranked below the fetch cutoff for every other
    result but still showed up once."""
    pages = [
        {"url": "https://github.com/some-org/acme_sdk"},
        {"url": "https://nango.dev/docs/integrations/acme"},
        {"url": "https://acme.app/developers/oauth-2-0-authentication"},
    ]
    assert research._correct_domain_from_pages("leadiq.com", pages, "Acme") == "acme.app"


def test_prioritize_own_domain_moves_matching_results_first():
    """fetch_documentation only fetches the first MAX_PAGES_TO_FETCH
    results, so a provider's own doc page ranked outside that cutoff would
    never get fetched (and therefore never get a chance to correct the
    domain) unless it's reordered first."""
    results = [
        {"url": "https://github.com/some-org/acme_sdk"},
        {"url": "https://nango.dev/docs/integrations/acme"},
        {"url": "https://better-auth.com/docs/authentication/acme"},
        {"url": "https://nocodb.com/docs/acme"},
        {"url": "https://developer.transmitsecurity.com/guides/acme"},
        {"url": "https://acme.app/developers/oauth-2-0-authentication"},
    ]
    reordered = research._prioritize_own_domain(results, "Acme")
    assert reordered[0]["url"] == "https://acme.app/developers/oauth-2-0-authentication"
    assert len(reordered) == len(results)


def test_coerce_responsible_party_falls_back_to_developer_for_unknown_values():
    """The LLM is instructed to use only developer|provider|agent but
    sometimes answers with something else (e.g. 'user'); that must degrade
    to a sane default instead of crashing guide generation."""
    assert research._coerce_responsible_party("user") == ResponsibleParty.developer
    assert research._coerce_responsible_party("workspace owner") == ResponsibleParty.developer
    assert research._coerce_responsible_party("provider") == ResponsibleParty.provider


def test_generate_guide_coerces_invalid_responsible_party_instead_of_raising():
    validated = {
        "summary": "Test",
        "recommended_setup_path": "custom",
        "setup_complexity": "low",
        "estimated_hands_on_setup_hours": 1,
        "approval_status": "not_required",
        "required_scopes": [],
        "setup_steps": [{"title": "Do it", "instructions": "Go here", "responsible_party": "workspace owner"}],
        "blockers": [],
        "recovery_actions": [],
        "unknowns": [],
        "sources": [],
    }
    guide = research.generate_guide("TestApp", "testapp.com", validated)
    assert guide.setup_steps[0].responsible_party == ResponsibleParty.developer


async def _collect(async_gen):
    return [event async for event in async_gen]
