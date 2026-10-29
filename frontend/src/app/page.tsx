"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listApps, ApiError } from "@/lib/api";
import type { AppSummary } from "@/lib/types";
import { AppCard } from "@/components/AppCard";
import { GuideGridCard } from "@/components/GuideGridCard";
import { SearchIcon, SparkleIcon, ChevronRightIcon } from "@/components/icons";

const TRY_QUERIES = ["Slack", "linear.app", "zapier.com"];

const HOW_IT_WORKS = [
  {
    title: "Search or paste a URL",
    body: "Open an existing guide, or enter any app's website to have one written.",
  },
  {
    title: "We read the official docs",
    body: "Developer portals, OAuth references and scope lists — not forums or guesses.",
  },
  {
    title: "Follow a sourced checklist",
    body: "Tick off each step, copy exact values, and share the guide with your team.",
  },
];

export default function HomePage() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listApps()
      .then(setApps)
      .catch((err: ApiError) => setLoadError(err.message));
  }, []);

  const needle = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!needle) return [];
    const scored = apps
      .map((app) => {
        const name = app.provider_name.toLowerCase();
        const domain = app.canonical_domain.toLowerCase();
        let score = -1;
        if (name === needle || domain === needle) score = 3;
        else if (name.startsWith(needle) || domain.startsWith(needle)) score = 2;
        else if (name.includes(needle) || domain.includes(needle)) score = 1;
        return { app, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((r) => r.app);
  }, [apps, needle]);

  const bestMatch = results[0];
  const otherResults = results.slice(1);
  const isSearching = needle.length > 0;

  return (
    <div>
      {!isSearching && (
        <section className="py-6 text-center sm:py-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
            Researched from official developer docs
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            Set up OAuth for any app, step by step
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-neutral-500 sm:text-lg">
            Register your app, configure redirects and scopes, and get through provider review —
            with every step linked to the documentation it came from.
          </p>

          <SearchBox query={query} onChange={setQuery} />

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-neutral-400">
            <span>Try</span>
            {TRY_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => setQuery(q)}
                className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      )}

      {isSearching && (
        <section className="mx-auto max-w-3xl py-4">
          <SearchBox query={query} onChange={setQuery} autoFocus />

          {loadError ? (
            <p className="mt-6 text-sm text-red-600">Could not load guides: {loadError}</p>
          ) : (
            <div className="mt-8 animate-fade-in">
              {bestMatch && (
                <>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400">BEST MATCH</p>
                  <div className="overflow-hidden rounded-xl border border-indigo-200 bg-white ring-1 ring-indigo-100">
                    <AppCard app={bestMatch} highlight />
                  </div>
                </>
              )}

              {otherResults.length > 0 && (
                <>
                  <p className="mt-8 mb-2 text-xs font-semibold tracking-wide text-neutral-400">
                    {bestMatch ? "OTHER POPULAR GUIDES" : "POPULAR GUIDES"}
                  </p>
                  <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    {otherResults.map((app) => (
                      <AppCard key={app.id} app={app} />
                    ))}
                  </div>
                </>
              )}

              {!bestMatch && otherResults.length === 0 && (
                <p className="rounded-xl border border-neutral-200 bg-white px-5 py-6 text-sm text-neutral-500">
                  No saved guides match “{query}” yet.
                </p>
              )}

              <div className="mt-6 flex flex-col items-start gap-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <SparkleIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-medium text-neutral-900">Not the app you need?</p>
                    <p className="text-sm text-neutral-500">
                      Enter any app&apos;s website and we&apos;ll write a guide from its official docs. It usually
                      takes 2–5 minutes.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/generate?q=${encodeURIComponent(query.trim())}`}
                  className="shrink-0 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                  Generate a guide
                </Link>
              </div>
            </div>
          )}
        </section>
      )}

      {!isSearching && (
        <>
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Popular guides</h2>
              <Link
                href="/guides"
                className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Browse all guides <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>

            {loadError && <p className="mt-4 text-sm text-red-600">Could not load guides: {loadError}</p>}

            {!loadError && apps.length === 0 && (
              <p className="mt-4 text-sm text-neutral-500">No guides yet — generate the first one.</p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {apps.slice(0, 6).map((app) => (
                <GuideGridCard key={app.id} app={app} />
              ))}
            </div>
          </section>

          <section id="how-it-works" className="mt-16 scroll-mt-20 border-t border-neutral-200 pt-10">
            <h2 className="text-lg font-semibold text-neutral-900">How it works</h2>
            <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {HOW_IT_WORKS.map((step, index) => (
                <div key={step.title}>
                  <p className="text-sm font-semibold text-indigo-600">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 font-semibold text-neutral-900">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-neutral-500">{step.body}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SearchBox({
  query,
  onChange,
  autoFocus,
}: {
  query: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="mx-auto mt-6 flex max-w-lg items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100"
    >
      <SearchIcon className="ml-2.5 h-4 w-4 shrink-0 text-neutral-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search an app or paste a website, e.g. linear.app"
        autoFocus={autoFocus}
        className="w-full bg-transparent px-1 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
      />
      {query && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="shrink-0 px-1 text-neutral-400 hover:text-neutral-600"
        >
          ×
        </button>
      )}
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
      >
        Find guide
      </button>
    </form>
  );
}

