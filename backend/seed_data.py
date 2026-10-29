"""
Hand-written seed guides for GitHub, Slack, and Google.

The facts in each guide (callback URL rules, scope names, approval
requirements) were checked against the official docs linked in `sources`
below. Where the docs did not state something precisely (e.g. Google's
verification review timeline), that is listed under `unknowns` instead of
being guessed.

`estimated_hands_on_setup_hours`, `estimated_external_wait_days`, and
`recommended_setup_path` are judgment calls, not facts scraped from a page:
effort/wait are our own estimates, and recommended_setup_path weighs how
much friction custom registration has against the control you give up by
relying on a managed/aggregator OAuth app instead - see guide_schema.py for
how that field is meant to be read.
"""

from datetime import datetime, timezone

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
)

_NOW = datetime(2026, 10, 29, tzinfo=timezone.utc)


def _github_guide() -> OAuthGuide:
    return OAuthGuide(
        id="github",
        provider_name="GitHub",
        canonical_domain="github.com",
        category="Code hosting",
        summary=(
            "Register an OAuth App under Developer Settings. No approval from GitHub is "
            "required to use it in production - registration is immediate and self-serve."
        ),
        recommended_setup_path=SetupPath.custom,
        setup_complexity=SetupComplexity.low,
        estimated_hands_on_setup_hours=1.0,
        estimated_external_wait_days=None,
        approval_status=ApprovalStatus.not_required,
        prerequisites=["A GitHub account"],
        redirect_uri_requirements=(
            "Up to 10 callback URLs can be registered per OAuth App. GitHub's docs do not "
            "describe partial/wildcard matching, so treat callback URLs as needing an exact match."
        ),
        required_scopes=["repo", "read:user", "user:email", "admin:org"],
        setup_steps=[
            SetupStep(
                id="step-1",
                title="Create a new OAuth App",
                instructions=(
                    "In GitHub, go to Settings > Developer settings > OAuth Apps > "
                    "New OAuth App."
                ),
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-2",
                title="Fill in application details",
                instructions="Provide the application name, homepage URL, and an optional description.",
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-3",
                title="Set the authorization callback URL",
                instructions=(
                    "Enter the exact URL GitHub should redirect to after authorization. "
                    "You can add up to 10 callback URLs."
                ),
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-4",
                title="Register the application",
                instructions="Click Register application to generate a Client ID and Client Secret.",
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-5",
                title="Store the client secret securely",
                instructions="Save the client secret in your backend's environment configuration, never in frontend code.",
                responsible_party=ResponsibleParty.developer,
            ),
        ],
        sources=[
            SourceEvidence(
                title="Creating an OAuth App",
                url="https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app",
                supports_claim="Registration steps and the 10-callback-URL limit.",
                verification_status=VerificationStatus.verified,
            ),
            SourceEvidence(
                title="OAuth apps overview",
                url="https://docs.github.com/en/apps/oauth-apps",
                supports_claim="OAuth Apps vs GitHub Apps distinction and general setup flow.",
                verification_status=VerificationStatus.verified,
            ),
        ],
        blockers=["Authorization callback URL mismatch error"],
        recovery_actions=[
            RecoveryAction(
                for_blocker="Authorization callback URL mismatch error",
                recovery_step="Confirm the redirect_uri sent in the authorization request exactly matches one of the registered callback URLs.",
                next_action="Update or add the correct callback URL in the OAuth App settings.",
                responsible_party=ResponsibleParty.developer,
            ),
        ],
        unknowns=[
            "GitHub's docs do not state whether callback URL matching allows a path prefix or requires a fully exact match.",
            "Rate limit behavior specific to OAuth Apps at scale is not detailed in the docs we reviewed.",
            "Managed OAuth (e.g. via an auth aggregator) is available for GitHub, but using your own app is "
            "recommended here since registration has no approval wait and gives you full control over branding.",
        ],
        last_researched_at=_NOW,
    )


def _slack_guide() -> OAuthGuide:
    return OAuthGuide(
        id="slack",
        provider_name="Slack",
        canonical_domain="slack.com",
        category="Team communication",
        summary=(
            "Create a Slack App and configure OAuth scopes. Installing the app into any "
            "workspace via OAuth is self-serve and needs no Slack review. Review is only "
            "required if you choose to list the app in the Slack Marketplace (formerly App Directory)."
        ),
        recommended_setup_path=SetupPath.custom,
        setup_complexity=SetupComplexity.medium,
        estimated_hands_on_setup_hours=3.0,
        estimated_external_wait_days=None,
        approval_status=ApprovalStatus.not_required,
        prerequisites=["A Slack workspace to develop against", "A Slack account"],
        redirect_uri_requirements=(
            "Redirect URI must use HTTPS (no HTTP) and must match, or be a subdirectory of, "
            "a Redirect URL configured in the app's settings. It cannot contain a URL fragment (#)."
        ),
        required_scopes=["channels:read", "chat:write", "users:read"],
        setup_steps=[
            SetupStep(
                id="step-1",
                title="Create a Slack App",
                instructions="Go to api.slack.com/apps and create a new app, choosing a workspace to develop in.",
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-2",
                title="Add OAuth scopes",
                instructions=(
                    "Under OAuth & Permissions, add bot scopes (for the app's bot user) and/or "
                    "user scopes (to act on behalf of a user), depending on what your app needs."
                ),
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-3",
                title="Configure the redirect URL",
                instructions="Add your HTTPS redirect URL under OAuth & Permissions.",
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-4",
                title="Implement the OAuth flow",
                instructions=(
                    "Redirect users to slack.com/oauth/v2/authorize with your client ID and scopes, "
                    "then exchange the returned code via oauth.v2.access for an access token."
                ),
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-5",
                title="(Optional) Submit to the Slack Marketplace",
                instructions="If you want public distribution and listing, enable public distribution and submit for review from the app's Review and Submit page.",
                responsible_party=ResponsibleParty.provider,
            ),
        ],
        sources=[
            SourceEvidence(
                title="Installing with OAuth",
                url="https://docs.slack.dev/authentication/installing-with-oauth",
                supports_claim="OAuth flow steps, redirect URL rules, and bot vs user scopes.",
                verification_status=VerificationStatus.verified,
            ),
            SourceEvidence(
                title="Distributing your app in the Slack Marketplace",
                url="https://api.slack.com/slack-marketplace/using",
                supports_claim="Marketplace/App Directory listing requires a separate review and is optional.",
                verification_status=VerificationStatus.verified,
            ),
        ],
        blockers=["invalid_redirect_uri error during OAuth exchange"],
        recovery_actions=[
            RecoveryAction(
                for_blocker="invalid_redirect_uri error during OAuth exchange",
                recovery_step="Check the redirect_uri parameter is HTTPS and exactly matches a URL configured in OAuth & Permissions.",
                next_action="Re-check the registered Redirect URLs list in your app's settings.",
                responsible_party=ResponsibleParty.developer,
            ),
        ],
        unknowns=[
            "Exact review turnaround time for Slack Marketplace submission is not published.",
            "As of July 2026 Slack requires 10+ active installs to submit to the Marketplace; this may not apply to apps that only need internal/direct-install OAuth.",
            "Managed OAuth (e.g. via an auth aggregator) is available for Slack, but a custom app is recommended "
            "here since install is self-serve and a custom app gives you your own branded consent screen.",
        ],
        last_researched_at=_NOW,
    )


def _google_guide() -> OAuthGuide:
    return OAuthGuide(
        id="google",
        provider_name="Google",
        canonical_domain="google.com",
        category="Identity & APIs",
        summary=(
            "Create OAuth 2.0 credentials in Google Cloud Console. Verification by Google is "
            "required only if your app requests sensitive or restricted scopes; apps using only "
            "basic scopes can skip full verification."
        ),
        recommended_setup_path=SetupPath.custom,
        setup_complexity=SetupComplexity.high,
        estimated_hands_on_setup_hours=4.0,
        estimated_external_wait_days=None,
        approval_status=ApprovalStatus.unknown,
        prerequisites=["A Google Cloud project", "A configured OAuth consent screen"],
        redirect_uri_requirements=(
            "Redirect URIs must be registered exactly in the Google Cloud Console credential "
            "configuration for the chosen client type (e.g. Web application)."
        ),
        required_scopes=["openid", "email", "profile"],
        setup_steps=[
            SetupStep(
                id="step-1",
                title="Create or select a Google Cloud project",
                instructions="Open the Google Cloud Console and create a new project, or select an existing one.",
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-2",
                title="Configure the OAuth consent screen",
                instructions="Set the app name, support email, and the scopes your app will request.",
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-3",
                title="Create OAuth 2.0 credentials",
                instructions="In APIs & Services > Credentials, create an OAuth client ID for your application type (e.g. Web application).",
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-4",
                title="Register redirect URIs",
                instructions="Add the exact redirect URI(s) your app will use to the OAuth client configuration.",
                responsible_party=ResponsibleParty.developer,
            ),
            SetupStep(
                id="step-5",
                title="Submit for verification, if required",
                instructions="If you request sensitive or restricted scopes, submit the app for Google's verification review before moving it out of testing mode.",
                responsible_party=ResponsibleParty.provider,
            ),
        ],
        sources=[
            SourceEvidence(
                title="Using OAuth 2.0 to Access Google APIs",
                url="https://developers.google.com/identity/protocols/oauth2",
                supports_claim="Credential setup steps and how scopes are requested.",
                verification_status=VerificationStatus.verified,
            ),
            SourceEvidence(
                title="OAuth API verification FAQs",
                url="https://support.google.com/cloud/answer/13463073",
                supports_claim="Verification is required only for sensitive or restricted scopes.",
                verification_status=VerificationStatus.verified,
            ),
        ],
        blockers=["App stuck in 'testing' publishing status"],
        recovery_actions=[
            RecoveryAction(
                for_blocker="App stuck in 'testing' publishing status",
                recovery_step="Testing-mode apps are limited to a small number of test users. Move to production (and complete verification if required) to allow general access.",
                next_action="Check the OAuth consent screen's publishing status in Cloud Console.",
                responsible_party=ResponsibleParty.developer,
            ),
        ],
        unknowns=[
            "Google does not publish a fixed timeline for the verification review process.",
            "Exact domain verification and privacy policy requirements for verification were not confirmed from the pages reviewed.",
            "Whether approval/verification applies to your specific app depends on which scopes you request, "
            "so approval_status is left unknown here rather than guessed.",
            "Managed OAuth (e.g. via an auth aggregator) is available for core Google services, which can skip "
            "verification entirely for scopes the aggregator already covers - worth considering if you only "
            "need basic, non-sensitive scopes.",
        ],
        last_researched_at=_NOW,
    )


SEED_GUIDES = [_github_guide(), _slack_guide(), _google_guide()]


def seed_if_empty() -> None:
    """Insert the seed guides only if the guides table is currently empty.

    This keeps re-running the backend safe: it won't overwrite a guide that
    was already generated or edited.
    """
    from database import list_guides, save_guide

    if list_guides():
        return
    for guide in SEED_GUIDES:
        save_guide(guide)
