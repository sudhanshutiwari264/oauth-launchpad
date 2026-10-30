import type { ApprovalStatus, SetupComplexity } from "@/lib/types";
import { ClockIcon, ShieldIcon } from "./icons";

const COMPLEXITY_STYLES: Record<SetupComplexity, string> = {
  low: "bg-emerald-100 text-emerald-700",
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
