"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listApps, ApiError } from "@/lib/api";
import type { AppSummary } from "@/lib/types";
import { AppCard } from "@/components/AppCard";

export default function GuidesIndexPage() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listApps()
      .then(setApps)
      .catch((err: ApiError) => setLoadError(err.message));
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-neutral-900">All guides</h1>
      <p className="mt-1 text-neutral-500">Every OAuth setup guide we&apos;ve researched so far.</p>

      {loadError && <p className="mt-6 text-sm text-red-600">Could not load guides: {loadError}</p>}

      {!loadError && apps.length === 0 && <p className="mt-6 text-sm text-neutral-500">No guides yet.</p>}

      {apps.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-5">
        <div>
          <p className="font-medium text-neutral-900">Don&apos;t see your app?</p>
          <p className="text-sm text-neutral-500">We can research it from official documentation.</p>
        </div>
        <Link
          href="/generate"
          className="shrink-0 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          Generate a guide
        </Link>
      </div>
    </div>
  );
}
