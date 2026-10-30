// These types mirror the Pydantic models in backend/guide_schema.py.
// Keeping them in sync by hand is fine at this project's size - there's
// only one schema file on the backend to check against.

export type SetupComplexity = "low" | "medium" | "high";
export type ApprovalStatus = "required" | "not_required" | "unknown";
export type SetupPath = "managed" | "custom" | "unknown";
export type ResponsibleParty = "agent" | "developer" | "provider";
export type VerificationStatus = "verified" | "unverified" | "conflicting";

export interface SourceEvidence {
  title: string;
  url: string;
  supports_claim: string;
  verification_status: VerificationStatus;
}

export interface SetupStep {
  id: string;
  title: string;
  instructions: string;
  responsible_party: ResponsibleParty;
  completed: boolean;
}

export interface RecoveryAction {
  for_blocker: string;
  recovery_step: string;
  next_action: string;
  responsible_party: ResponsibleParty;
}

export interface OAuthGuide {
  id: string;
  provider_name: string;
  canonical_domain: string;
  category: string;
  summary: string;
  recommended_setup_path: SetupPath;
  setup_complexity: SetupComplexity;
  estimated_hands_on_setup_hours: number;
  estimated_external_wait_days: number | null;
  approval_status: ApprovalStatus;
  prerequisites: string[];
  redirect_uri_requirements: string;
  required_scopes: string[];
  setup_steps: SetupStep[];
  sources: SourceEvidence[];
  blockers: string[];
  recovery_actions: RecoveryAction[];
  unknowns: string[];
  last_researched_at: string;
}

// The smaller shape returned by GET /api/apps for the home-page directory.
export interface AppSummary {
  id: string;
  provider_name: string;
  canonical_domain: string;
  category: string;
  setup_complexity: SetupComplexity;
  estimated_hands_on_setup_hours: number;
  approval_status: ApprovalStatus;
}

// One line of the newline-delimited JSON stream from POST /api/guides/generate.
export type GenerateStageName =
  | "identify_provider"
  | "search_documentation"
  | "fetch_documentation"
  | "extract_requirements"
  | "validate_and_generate"
  | "complete";

export interface GenerateEvent {
  stage: GenerateStageName;
  label?: string;
  status: "running" | "done" | "error";
  message?: string;
  guide?: OAuthGuide;
  // True when "complete" returns an already-researched guide for this
  // domain instead of running fresh research - see backend/research.py's
  // run_pipeline docstring. Use "Re-check sources" to force a refresh.
  reused_existing?: boolean;
}
