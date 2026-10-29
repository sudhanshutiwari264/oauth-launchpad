import type { ApprovalStatus, SetupComplexity, SetupPath } from "@/lib/types";
import { ClockIcon, ShieldIcon } from "./icons";

const COMPLEXITY_STYLES: Record<SetupComplexity, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const COMPLEXITY_LABEL: Record<SetupComplexity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function ComplexityBadge({
  complexity,
  suffix,
}: {
  complexity: SetupComplexity;
  suffix?: string;
}) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COMPLEXITY_STYLES[complexity]}`}>
      {COMPLEXITY_LABEL[complexity]}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

const APPROVAL_STYLES: Record<ApprovalStatus, string> = {
  required: "bg-green-100 text-green-700",
  not_required: "bg-slate-100 text-slate-600",
  unknown: "bg-slate-100 text-slate-500",
};

const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  required: "Approval required",
  not_required: "No approval needed",
  unknown: "Approval unknown",
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${APPROVAL_STYLES[status]}`}>
      {APPROVAL_LABEL[status]}
    </span>
  );
}

const SETUP_PATH_LABEL: Record<SetupPath, string> = {
  managed: "Managed OAuth may be sufficient",
  custom: "Custom OAuth app recommended",
  unknown: "Setup path unknown",
};

export function SetupPathBadge({ path }: { path: SetupPath }) {
  return (
    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
      {SETUP_PATH_LABEL[path]}
    </span>
  );
}

export function EffortBadge({ hours }: { hours: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
      <ClockIcon className="h-3.5 w-3.5" />~{hours} {hours === 1 ? "hr" : "hrs"}
    </span>
  );
}

// "required" or "unknown" approval both mean a developer should expect some
// scope might trigger provider review, so both get a note; "not_required"
// gets none. Returned as plain text (not a component) so callers can place
// it next to other badges without forcing a specific layout.
export function reviewNoteText(status: ApprovalStatus): string | null {
  if (status === "required") return "Review required";
  if (status === "unknown") return "Review for some scopes";
  return null;
}

export function ReviewNote({ status }: { status: ApprovalStatus }) {
  const text = reviewNoteText(status);
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
      <ShieldIcon className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}
