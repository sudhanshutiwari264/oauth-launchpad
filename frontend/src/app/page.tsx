"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listApps, ApiError } from "@/lib/api";
import type { AppSummary, SetupComplexity } from "@/lib/types";
import { ALL_APPS_BUCKET, bucketForCategory, CATEGORY_BUCKETS, OTHER_BUCKET } from "@/lib/categories";
import { ProviderIcon } from "@/components/ProviderIcon";
import { ComplexityBadge, EffortBadge, ReviewNote } from "@/components/Badge";
import {
  ArrowUpRightIcon,
  BookIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  GridIcon,
  ListIcon,
  SearchIcon,
  ShieldIcon,
  ZapIcon,
} from "@/components/icons";

const COMPLEXITY_RANK: Record<SetupComplexity, number> = { low: 0, medium: 1, high: 2 };
type SortKey = "name" | "quickest" | "easiest";
type ViewMode = "grid" | "list";

const HERO_FEATURES = [
  {
    icon: ZapIcon,
    title: "Clear requirements",
    body: "Know what you need upfront.",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    icon: ClockIcon,
    title: "Real timelines",
    body: "Plan with confidence.",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    icon: ShieldIcon,
    title: "Provider approval info",
    body: "Know if review is needed.",
    iconBg: "bg-red-50",
    iconColor: "text-red-500",
  },
];

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [selectedBucket, setSelectedBucket] = useState<string>(ALL_APPS_BUCKET.name);
  const [selectedEfforts, setSelectedEfforts] = useState<Set<SetupComplexity>>(new Set());
  const [requiresReviewOnly, setRequiresReviewOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    listApps()
      .then(setApps)
      .catch((err: ApiError) => setLoadError(err.message));
  }, []);

  const bucketCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const app of apps) {
      const bucket = bucketForCategory(app.category || "").name;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return counts;
  }, [apps]);

  const visibleBuckets = useMemo(
    () => [...CATEGORY_BUCKETS, OTHER_BUCKET].filter((b) => (bucketCounts.get(b.name) ?? 0) > 0),
    [bucketCounts]
  );

  const effortCounts = useMemo(() => {
    const counts: Record<SetupComplexity, number> = { low: 0, medium: 0, high: 0 };
    for (const app of apps) counts[app.setup_complexity]++;
    return counts;
  }, [apps]);

  const reviewRequiredCount = useMemo(() => apps.filter((a) => a.approval_status === "required").length, [apps]);

  const activeFilterCount =
    (selectedBucket !== ALL_APPS_BUCKET.name ? 1 : 0) + selectedEfforts.size + (requiresReviewOnly ? 1 : 0) + (query ? 1 : 0);

  function clearAllFilters() {
    setSelectedBucket(ALL_APPS_BUCKET.name);
    setSelectedEfforts(new Set());
    setRequiresReviewOnly(false);
    setQuery("");
  }

  function toggleEffort(level: SetupComplexity) {
    setSelectedEfforts((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  const filteredSorted = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = apps.filter((app) => {
      const matchesQuery =
        !needle ||
        app.provider_name.toLowerCase().includes(needle) ||
        app.canonical_domain.toLowerCase().includes(needle) ||
        app.category.toLowerCase().includes(needle);
      const matchesBucket =
        selectedBucket === ALL_APPS_BUCKET.name || bucketForCategory(app.category || "").name === selectedBucket;
      const matchesEffort = selectedEfforts.size === 0 || selectedEfforts.has(app.setup_complexity);
      const matchesReview = !requiresReviewOnly || app.approval_status === "required";
      return matchesQuery && matchesBucket && matchesEffort && matchesReview;
    });

    result = [...result].sort((a, b) => {
      if (sortKey === "quickest") return a.estimated_hands_on_setup_hours - b.estimated_hands_on_setup_hours;
      if (sortKey === "easiest") return COMPLEXITY_RANK[a.setup_complexity] - COMPLEXITY_RANK[b.setup_complexity];
      return a.provider_name.localeCompare(b.provider_name);
    });
    return result;
  }, [apps, query, selectedBucket, selectedEfforts, requiresReviewOnly, sortKey]);

  // Dedupe by provider_name (not just id) so e.g. two guides that both
  // ended up named "Notion" before duplicate-prevention existed don't show
  // as two identical "Notion" chips - keyed by id since that's what's
  // actually unique.
  const popularChips = useMemo(() => {
    const seenNames = new Set<string>();
    const chips: AppSummary[] = [];
    for (const app of apps) {
      if (seenNames.has(app.provider_name)) continue;
      seenNames.add(app.provider_name);
      chips.push(app);
      if (chips.length === 8) break;
    }
    return chips;
  }, [apps]);
  const heroPreviewApp = apps.find((a) => a.id === "github") ?? apps[0];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-neutral-200 p-6 sm:p-10">
        <Image
          src="/hero-gradient.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/92 to-white/35" />

        <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700">
              <BookIcon className="h-3.5 w-3.5" />
              Researched from official developer docs
            </span>

            <h1 className="mt-5 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
              Integrate any app with your{" "}
              <span className="bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">AI agent.</span>
            </h1>
            <p className="mt-4 max-w-lg text-base text-neutral-600 sm:text-lg">
              Step-by-step OAuth setup guides, requirements, scopes, and timelines
              {apps.length > 0 ? ` for ${apps.length}+ apps` : ""} — sourced from each provider&apos;s official
              documentation.
            </p>

            <form
              onSubmit={(e) => e.preventDefault()}
              className="mt-6 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"
            >
              <SearchIcon className="ml-2.5 h-4 w-4 shrink-0 text-neutral-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for any app (e.g. GitHub, Slack, Google, Zapier...)"
                className="w-full bg-transparent px-1 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
              />
              <button
                type="submit"
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Search
                <ArrowUpRightIcon className="h-3.5 w-3.5 rotate-45" />
              </button>
            </form>

            {popularChips.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
                <span>Popular:</span>
                {popularChips.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => setQuery(app.provider_name)}
                    className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white py-1 pr-3 pl-1.5 text-neutral-700 transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <ProviderIcon name={app.provider_name} domain={app.canonical_domain} size="sm" />
                    {app.provider_name}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-4 border-t border-neutral-200/80 pt-5 sm:grid-cols-3">
              {HERO_FEATURES.map((feature) => (
                <div key={feature.title} className="flex items-start gap-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${feature.iconBg}`}>
                    <feature.icon className={`h-4 w-4 ${feature.iconColor}`} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{feature.title}</p>
                    <p className="text-xs text-neutral-500">{feature.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <HeroIllustration apps={apps} previewApp={heroPreviewApp} />
        </div>
      </section>

      {/* Catalog */}
      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Guides</p>
            <h2 className="mt-0.5 text-3xl font-bold tracking-tight text-neutral-900">All OAuth Guides</h2>
            <p className="mt-1 text-neutral-500">
              {filteredSorted.length === apps.length
                ? `Step-by-step setup guides for ${apps.length}+ apps, sourced from official documentation.`
                : `${filteredSorted.length} of ${apps.length} guides match your filters.`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 items-center rounded-lg border border-neutral-200 bg-white p-1 shadow-sm">
              <button
                onClick={() => setViewMode("grid")}
                aria-label="Cards view"
                aria-pressed={viewMode === "grid"}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${viewMode === "grid" ? "bg-blue-50 text-blue-700" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                <GridIcon className="h-4 w-4" />
                Cards
              </button>
              <button
                onClick={() => setViewMode("list")}
                aria-label="Table view"
                aria-pressed={viewMode === "list"}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${viewMode === "list" ? "bg-blue-50 text-blue-700" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                <ListIcon className="h-4 w-4" />
                Table
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              Sort by
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900 shadow-sm focus:border-blue-400 focus:outline-none"
              >
                <option value="name">Name (A–Z)</option>
                <option value="quickest">Quickest setup first</option>
                <option value="easiest">Easiest first</option>
              </select>
            </label>
          </div>
        </div>

        {/* Horizontal category tabs */}
        <div className="mt-6 flex items-center gap-2.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedBucket(ALL_APPS_BUCKET.name)}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
              selectedBucket === ALL_APPS_BUCKET.name
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
            }`}
          >
            <ALL_APPS_BUCKET.icon className="h-4 w-4" />
            All Apps
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${selectedBucket === ALL_APPS_BUCKET.name ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-500"}`}
            >
              {apps.length}
            </span>
          </button>
          {visibleBuckets.map((bucket) => (
            <button
              key={bucket.name}
              onClick={() => setSelectedBucket(bucket.name)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                selectedBucket === bucket.name
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
              }`}
            >
              <bucket.icon className="h-4 w-4" />
              {bucket.name}
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${selectedBucket === bucket.name ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-500"}`}
              >
                {bucketCounts.get(bucket.name)}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
          <aside className="h-fit rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-neutral-900">Filters</span>
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters} className="text-xs font-medium text-blue-600 hover:underline">
                  Clear all
                </button>
              )}
            </div>

            <p className="mt-4 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Search</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
              <SearchIcon className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search apps, guides..."
                className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
              />
            </div>

            <p className="mt-5 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Category</p>
            <ul className="mt-2 flex flex-col gap-0.5">
              <FilterCheckbox
                label="All Apps"
                count={apps.length}
                checked={selectedBucket === ALL_APPS_BUCKET.name}
                onChange={() => setSelectedBucket(ALL_APPS_BUCKET.name)}
              />
              {visibleBuckets.map((bucket) => (
                <FilterCheckbox
                  key={bucket.name}
                  label={bucket.name}
                  count={bucketCounts.get(bucket.name) ?? 0}
                  checked={selectedBucket === bucket.name}
                  onChange={() => setSelectedBucket(bucket.name)}
                />
              ))}
            </ul>

            <p className="mt-5 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Effort level</p>
            <ul className="mt-2 flex flex-col gap-0.5">
              {(["low", "medium", "high"] as SetupComplexity[]).map((level) => (
                <FilterCheckbox
                  key={level}
                  label={level === "low" ? "Low effort" : level === "medium" ? "Medium effort" : "High effort"}
                  count={effortCounts[level]}
                  checked={selectedEfforts.has(level)}
                  onChange={() => toggleEffort(level)}
                  multi
                />
              ))}
            </ul>

            <p className="mt-5 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Needs provider review</p>
            <ul className="mt-2 flex flex-col gap-0.5">
              <FilterCheckbox
                label="Requires review"
                count={reviewRequiredCount}
                checked={requiresReviewOnly}
                onChange={() => setRequiresReviewOnly((v) => !v)}
                multi
              />
            </ul>
          </aside>

          <div className="min-w-0">
            {loadError && <p className="text-sm text-red-600">Could not load guides: {loadError}</p>}

            {!loadError && apps.length === 0 && (
              <p className="text-sm text-neutral-500">No guides yet — generate the first one.</p>
            )}

            {!loadError && apps.length > 0 && filteredSorted.length === 0 && (
              <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500">
                No guides match these filters yet.{" "}
                <Link href={`/generate?q=${encodeURIComponent(query.trim())}`} className="font-medium text-blue-600 hover:underline">
                  Generate one
                </Link>
                .
              </p>
            )}

            <div
              className={
                viewMode === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2" : "flex flex-col gap-3"
              }
            >
              {filteredSorted.map((app) =>
                viewMode === "grid" ? <CatalogCard key={app.id} app={app} /> : <CatalogListRow key={app.id} app={app} />
              )}
            </div>

            {/* Request-a-guide banner */}
            <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                  <BookIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-blue-900">Can&apos;t find your app?</p>
                  <p className="text-sm text-blue-700">
                    Enter its name or website and we&apos;ll research it live from official docs — usually ready in
                    2-5 minutes.
                  </p>
                </div>
              </div>
              <Link
                href={`/generate${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Generate a guide
                <ArrowUpRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FilterCheckbox({
  label,
  count,
  checked,
  onChange,
  multi,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
  multi?: boolean;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-neutral-50">
        <span className="flex min-w-0 items-center gap-2 text-neutral-700">
          <input
            type={multi ? "checkbox" : "radio"}
            checked={checked}
            onChange={onChange}
            className="h-4 w-4 shrink-0 accent-blue-600"
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-xs text-neutral-400">{count}</span>
      </label>
    </li>
  );
}

function CatalogCard({ app }: { app: AppSummary }) {
  return (
    <Link
      href={`/guides/${app.id}`}
      className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <ProviderIcon name={app.provider_name} domain={app.canonical_domain} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-neutral-900">{app.provider_name}</p>
          <p className="truncate text-sm text-neutral-500">{app.category || app.canonical_domain}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <ComplexityBadge complexity={app.setup_complexity} suffix="effort" />
        <span className="flex items-center gap-1 text-xs text-neutral-400">
          <ClockIcon className="h-3.5 w-3.5" />
          <EffortBadge hours={app.estimated_hands_on_setup_hours} />
        </span>
        <ReviewNote status={app.approval_status} />
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-neutral-600">{app.summary}</p>

      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
        <span className="flex items-center gap-1.5 text-sm font-medium text-blue-600">
          <BookIcon className="h-4 w-4" />
          View guide
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-400 transition group-hover:border-blue-300 group-hover:bg-blue-50 group-hover:text-blue-600">
          <ArrowUpRightIcon className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

function CatalogListRow({ app }: { app: AppSummary }) {
  return (
    <Link
      href={`/guides/${app.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <ProviderIcon name={app.provider_name} domain={app.canonical_domain} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-neutral-900">{app.provider_name}</p>
        <p className="truncate text-sm text-neutral-500">{app.category || app.canonical_domain}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <ComplexityBadge complexity={app.setup_complexity} suffix="effort" />
        <ReviewNote status={app.approval_status} />
      </div>
      <div className="hidden shrink-0 items-center gap-1 text-xs text-neutral-400 md:flex">
        <ClockIcon className="h-3.5 w-3.5" />
        <EffortBadge hours={app.estimated_hands_on_setup_hours} />
      </div>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition group-hover:text-blue-500" />
    </Link>
  );
}

const CHECKLIST_STEPS = ["Create app", "Configure OAuth", "Set scopes", "Get approval", "Go live"];

function HeroIllustration({ apps, previewApp }: { apps: AppSummary[]; previewApp?: AppSummary }) {
  const scattered = apps.filter((a) => a.id !== previewApp?.id).slice(0, 7);
  const positions = SCATTER_POSITIONS.slice(0, scattered.length);

  return (
    <div className="relative hidden h-96 w-[480px] lg:block">
      {/* connecting lines from each floating icon to the central card - viewBox
          matches the container's literal pixel size exactly (see w-[480px]
          h-96 above) so these coordinates line up 1:1 with the icon divs'
          inline left/top styles below, instead of SVG-scaling independently. */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 480 384" fill="none">
        {positions.map((pos, index) => (
          <line
            key={index}
            x1={pos.x}
            y1={pos.y}
            x2="240"
            y2="190"
            stroke="#c7d2fe"
            strokeWidth="1.5"
            strokeDasharray="3 4"
          />
        ))}
      </svg>

      {/* pedestal the central card "sits" on */}
      <div className="absolute top-[232px] left-1/2 h-10 w-64 -translate-x-1/2 rounded-[50%] bg-gradient-to-b from-blue-100 to-blue-50 blur-[2px]" />

      {scattered.map((app, index) => (
        <div
          key={app.id}
          className="absolute flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-white shadow-sm"
          style={{ left: positions[index].x - 28, top: positions[index].y - 28 }}
        >
          <ProviderIcon name={app.provider_name} domain={app.canonical_domain} />
        </div>
      ))}

      {previewApp && (
        <div className="absolute top-10 left-1/2 w-64 -translate-x-1/2 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl">
          <p className="text-sm font-semibold text-neutral-900">OAuth Setup</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {CHECKLIST_STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2 text-xs text-neutral-600">
                {i < CHECKLIST_STEPS.length - 1 ? (
                  <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-neutral-300" />
                )}
                {step}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-1.5">
            <code className="truncate text-[10px] text-neutral-500">redirect_uri: https://your-app.com/callback</code>
            <CopyIcon className="h-3 w-3 shrink-0 text-neutral-400" />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-neutral-400">
            <ProviderIcon name={previewApp.provider_name} domain={previewApp.canonical_domain} size="sm" />
            Based on the real {previewApp.provider_name} guide
          </div>
        </div>
      )}

      <p
        className="absolute top-[-6px] right-[-14px] w-28 rotate-[-6deg] text-right text-lg leading-tight text-blue-700"
        style={{ fontFamily: "var(--font-caveat)" }}
      >
        From idea to integration in minutes
      </p>
    </div>
  );
}

// Rough (x, y) centers in the 440x384 viewBox the connecting lines and
// floating icons share - hand-placed to read as a loose ring around the
// central card, not any precise layout.
const SCATTER_POSITIONS = [
  { x: 50, y: 15 },
  { x: 380, y: 30 },
  { x: 15, y: 170 },
  { x: 452, y: 170 },
  { x: 90, y: 345 },
  { x: 240, y: 362 },
  { x: 390, y: 345 },
];
