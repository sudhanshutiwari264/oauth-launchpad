import Link from "next/link";
import type { AppSummary } from "@/lib/types";
import { ComplexityBadge, EffortBadge } from "./Badge";
import { ProviderIcon } from "./ProviderIcon";
import { ChevronRightIcon } from "./icons";

export function AppCard({ app, highlight = false }: { app: AppSummary; highlight?: boolean }) {
  return (
    <Link
      href={`/guides/${app.id}`}
      className={`flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-4 transition last:border-b-0 hover:bg-neutral-50 ${
        highlight ? "rounded-xl border border-neutral-200 bg-white" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <ProviderIcon name={app.provider_name} domain={app.canonical_domain} />
        <div>
          <p className="font-semibold text-neutral-900">{app.provider_name}</p>
          <p className="text-sm text-neutral-500">
            {app.category ? `${app.category} · ` : ""}
            {app.canonical_domain}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ComplexityBadge complexity={app.setup_complexity} />
        <EffortBadge hours={app.estimated_hands_on_setup_hours} />
        {highlight ? (
          <span className="hidden items-center gap-1 text-sm font-medium text-indigo-600 sm:flex">
            Open guide <ChevronRightIcon className="h-4 w-4" />
          </span>
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
        )}
      </div>
    </Link>
  );
}
