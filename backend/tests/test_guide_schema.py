"""
Tests for the Pydantic models in guide_schema.py.

These tests don't touch the network, the database, or any external
service - they only check that our data validation rules actually work.
"""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

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


def make_valid_guide(**overrides) -> dict:
    """A baseline, fully-valid guide payload that individual tests tweak."""
    base = dict(
        id="github",
        provider_name="GitHub",
        canonical_domain="github.com",
        summary="Register an OAuth app in GitHub Developer Settings.",
        recommended_setup_path=SetupPath.custom,
        setup_complexity=SetupComplexity.low,
        estimated_hands_on_setup_hours=1.0,
        estimated_external_wait_days=None,
        approval_status=ApprovalStatus.not_required,
        prerequisites=["A GitHub account"],
        redirect_uri_requirements="Must be an exact match, https in production.",
        required_scopes=["repo", "read:user"],
        setup_steps=[
            SetupStep(
                id="step-1",
                title="Create a new OAuth app",
                instructions="Go to Settings > Developer settings > OAuth Apps > New OAuth App.",
                responsible_party=ResponsibleParty.developer,
                completed=False,
            )
        ],
        sources=[
            SourceEvidence(
                title="GitHub Docs: Creating an OAuth App",
                url="https://docs.github.com/en/apps/oauth-apps",
                supports_claim="Describes the OAuth app creation flow.",
                verification_status=VerificationStatus.verified,
            )
        ],
        blockers=["Callback URL mismatch"],
        recovery_actions=[
            RecoveryAction(
                for_blocker="Callback URL mismatch",
                recovery_step="Update the authorization callback URL in app settings.",
                next_action="Re-check the redirect URI matches exactly.",
                responsible_party=ResponsibleParty.developer,
            )
        ],
        unknowns=["Rate limits for OAuth apps are not fully documented."],
        last_researched_at=datetime.now(timezone.utc),
    )
    base.update(overrides)
    return base


def test_valid_guide_is_accepted():
    guide = OAuthGuide(**make_valid_guide())
    assert guide.provider_name == "GitHub"
    assert guide.approval_status == ApprovalStatus.not_required
    assert guide.recommended_setup_path == SetupPath.custom


def test_negative_setup_hours_rejected():
    with pytest.raises(ValidationError):
        OAuthGuide(**make_valid_guide(estimated_hands_on_setup_hours=-1))


def test_negative_wait_days_rejected():
    with pytest.raises(ValidationError):
        OAuthGuide(**make_valid_guide(estimated_external_wait_days=-5))


def test_approval_status_accepts_unknown():
    guide = OAuthGuide(**make_valid_guide(approval_status=ApprovalStatus.unknown))
    assert guide.approval_status == ApprovalStatus.unknown


def test_recommended_setup_path_accepts_unknown():
    guide = OAuthGuide(**make_valid_guide(recommended_setup_path=SetupPath.unknown))
    assert guide.recommended_setup_path == SetupPath.unknown


def test_invalid_canonical_domain_rejected():
    with pytest.raises(ValidationError):
        OAuthGuide(**make_valid_guide(canonical_domain="not a domain"))


def test_source_with_unsafe_url_rejected():
    with pytest.raises(ValidationError):
        SourceEvidence(
            title="Fake doc",
            url="http://localhost/admin",
            supports_claim="Should never be accepted.",
            verification_status=VerificationStatus.unverified,
        )


def test_source_with_private_ip_url_rejected():
    with pytest.raises(ValidationError):
        SourceEvidence(
            title="Fake doc",
            url="http://192.168.1.5/secret",
            supports_claim="Should never be accepted.",
            verification_status=VerificationStatus.unverified,
        )


def test_source_with_non_http_scheme_rejected():
    with pytest.raises(ValidationError):
        SourceEvidence(
            title="Fake doc",
            url="file:///etc/passwd",
            supports_claim="Should never be accepted.",
            verification_status=VerificationStatus.unverified,
        )


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://docs.github.com/en/apps", True),
        ("http://localhost:8000", False),
        ("http://127.0.0.1", False),
        ("http://10.0.0.1", False),
        ("ftp://example.com", False),
        ("https://slack.com/help", True),
    ],
)
def test_is_safe_public_url(url, expected):
    assert is_safe_public_url(url) is expected


def test_setup_step_requires_non_empty_title():
    with pytest.raises(ValidationError):
        SetupStep(
            id="step-1",
            title="",
            instructions="Do the thing.",
            responsible_party=ResponsibleParty.developer,
        )


def test_recovery_action_requires_non_empty_fields():
    with pytest.raises(ValidationError):
        RecoveryAction(
            for_blocker="Callback URL mismatch",
            recovery_step="",
            next_action="Re-check the redirect URI.",
            responsible_party=ResponsibleParty.developer,
        )
