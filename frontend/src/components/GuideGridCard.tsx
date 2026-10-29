import Link from "next/link";
import type { AppSummary } from "@/lib/types";
import { ComplexityBadge, EffortBadge, ReviewNote } from "./Badge";
import { ProviderIcon } from "./ProviderIcon";
import { ChevronRightIcon } from "./icons";

export function GuideGridCard({ app }: { app: AppSummary }) {
  return (
    <Link
      href={`/guides/${app.id}`}
      className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProviderIcon name={app.provider_name} domain={app.canonical_domain} />
          <div>
            <p className="font-semibold text-neutral-900">{app.provider_name}</p>
            <p className="text-sm text-neutral-500">{app.category || app.canonical_domain}</p>
          </div>
        </div>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition group-hover:text-neutral-500" />
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-neutral-100 pt-3 text-xs">
        <ComplexityBadge complexity={app.setup_complexity} />
        <EffortBadge hours={app.estimated_hands_on_setup_hours} />
        <ReviewNote status={app.approval_status} />
      </div>
    </Link>
  );
}
