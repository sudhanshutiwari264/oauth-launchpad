"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { generateGuide, ApiError } from "@/lib/api";
import type { GenerateEvent, GenerateStageName, OAuthGuide } from "@/lib/types";
import { ProviderIcon } from "@/components/ProviderIcon";
import { CheckIcon, FileIcon, ShieldIcon } from "@/components/icons";

const STAGES: { key: GenerateStageName; label: string }[] = [
  { key: "identify_provider", label: "Identifying the provider" },
  { key: "search_documentation", label: "Searching official documentation" },
  { key: "fetch_documentation", label: "Reading relevant pages" },
  { key: "extract_requirements", label: "Extracting requirements and scopes" },
  { key: "validate_and_generate", label: "Writing the step-by-step guide" },
];

const WHAT_HAPPENS_NEXT = [
  {
    title: "Find official documentation",
    body: "Developer portal, OAuth reference and scope lists.",
  },
  {
    title: "Extract requirements and scopes",
    body: "Redirect URI rules, app details and review conditions.",
  },
  {
    title: "Write a step-by-step guide",
    body: "Every step links back to the page it came from.",
  },
  {
    title: "Save it to Guides",
    body: "Shareable with your team, re-checkable any time.",
  },
];

type StageStatus = "pending" | "running" | "done" | "error";
type Phase = "form" | "running" | "ready" | "error";

const emptyStageStatus = () =>
  Object.fromEntries(STAGES.map((s) => [s.key, "pending"])) as Record<GenerateStageName, StageStatus>;

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GenerateContentKeyedByUrl />
    </Suspense>
  );
}

// Keying by the full search string forces a remount (and so a clean reset
// of all local state) whenever the URL actually changes - including when
// the header's "+ New guide" link appends a cache-busting param to force a
// fresh visit while already on this page. See Header.tsx.
function GenerateContentKeyedByUrl() {
  const searchParams = useSearchParams();
  return <GenerateContent key={searchParams.toString()} />;
}

function GenerateContent() {
  const searchParams = useSearchParams();

  const [input, setInput] = useState(searchParams.get("q") ?? "");
  const [intendedUse, setIntendedUse] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [stageStatus, setStageStatus] = useState<Record<GenerateStageName, StageStatus>>(emptyStageStatus());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [readyGuide, setReadyGuide] = useState<OAuthGuide | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startedAtRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => clearInterval(interval);
  }, [phase]);

  const looksLikeWebsite = useMemo(() => {
    const value = input.trim();
    return value.includes(".") && !value.includes(" ") && value.length > 3;
  }, [input]);

  async function handleGenerate() {
    if (!input.trim() || phase === "running") return;

    setPhase("running");
    setErrorMessage(null);
    setReadyGuide(null);
    setStageStatus(emptyStageStatus());
    startedAtRef.current = Date.now();
    setElapsedMs(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await generateGuide(
        input.trim(),
        (event: GenerateEvent) => {
          if (event.stage === "complete" && event.guide) {
            setReadyGuide(event.guide);
            setPhase("ready");
            return;
          }
          if (event.status === "error") {
            setStageStatus((prev) => ({ ...prev, [event.stage]: "error" }));
            setErrorMessage(event.message ?? "Research failed for an unknown reason.");
            setPhase("error");
            return;
          }
          setStageStatus((prev) => ({ ...prev, [event.stage]: event.status as StageStatus }));
        },
        { intendedUse: intendedUse.trim() || undefined, signal: controller.signal }
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMessage(err instanceof ApiError ? err.message : "Could not reach the backend.");
      setPhase("error");
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setPhase("form");
    setStageStatus(emptyStageStatus());
    setErrorMessage(null);
  }

  // Next.js reuses this component across client-side navigations back to
  // /generate (e.g. the header's "+ New guide" link), so phase/readyGuide
  // from a previous run would otherwise stick around. This gives an
  // explicit way back to a blank form instead of relying on a remount.
  function handleStartOver() {
    abortRef.current?.abort();
    setInput("");
    setIntendedUse("");
    setPhase("form");
    setStageStatus(emptyStageStatus());
    setErrorMessage(null);
    setReadyGuide(null);
  }

  if (phase === "form") {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Generate an OAuth guide</h1>
        <p className="mt-1 text-neutral-500">
          Tell us which app you want to connect to. We&apos;ll find its official developer docs and turn them into a
          step-by-step checklist.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <label className="text-sm font-medium text-neutral-900">App name or website</label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Zapier or zapier.com"
              className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
            {looksLikeWebsite && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckIcon className="h-4 w-4" />
                Website recognised — we&apos;ll start from {input.trim().replace(/^https?:\/\//, "")}&apos;s
                developer docs.
              </p>
            )}

            <label className="mt-5 block text-sm font-medium text-neutral-900">
              What will your integration do? <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <textarea
              value={intendedUse}
              onChange={(e) => setIntendedUse(e.target.value)}
              placeholder="e.g. Read a user's Zaps and show their run history in our dashboard"
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-neutral-300 px-4 py-2.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              Helps us recommend only the scopes you need — fewer scopes usually means an easier review.
            </p>

            <button
              onClick={handleGenerate}
              disabled={!input.trim()}
              className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              Generate guide
            </button>
            <p className="mt-2 text-center text-xs text-neutral-400">
              Usually takes 2–5 minutes. You can leave the page while it runs.
            </p>
          </div>

          <aside className="h-fit rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-neutral-900">What happens next</h2>
            <ol className="mt-4 flex flex-col gap-4">
              {WHAT_HAPPENS_NEXT.map((item, index) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-600">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{item.title}</p>
                    <p className="text-sm text-neutral-500">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
              <ShieldIcon className="h-4 w-4 shrink-0 text-neutral-400" />
              Official sources only. Where the docs are unclear, we say so under &ldquo;Open questions&rdquo;
              instead of guessing.
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const stepLabel = readyGuide ? `${readyGuide.provider_name} guide ready` : `Generating a guide for “${input.trim()}”`;

  return (
    <div className="mx-auto max-w-5xl">
      <button
        onClick={handleStartOver}
        className="mb-4 text-sm font-medium text-neutral-500 hover:text-neutral-900"
      >
        ← Generate a different guide
      </button>

      <div className="flex items-center gap-3">
        {readyGuide ? (
          <ProviderIcon name={readyGuide.provider_name} domain={readyGuide.canonical_domain} size="lg" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-neutral-100">
            <FileIcon className="h-5 w-5 text-neutral-400" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{stepLabel}</h1>
          <p className="text-sm text-neutral-500">
            {phase === "ready" ? `Finished in ${formatElapsed(elapsedMs)}` : `Running for ${formatElapsed(elapsedMs)}`}
          </p>
        </div>
      </div>

      {phase === "ready" && readyGuide && (
        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-medium text-emerald-900">Your {readyGuide.provider_name} guide is ready</p>
            <p className="text-sm text-emerald-700">
              {readyGuide.setup_steps.length} steps · {readyGuide.sources.length} official sources ·{" "}
              {readyGuide.unknowns.length} open questions
            </p>
          </div>
          <Link
            href={`/guides/${readyGuide.id}?generated=1`}
            className="shrink-0 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            Open guide
          </Link>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="font-medium text-red-800">Research failed</p>
          <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
          <button
            onClick={handleGenerate}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Progress</h2>
            <span className="text-xs text-neutral-400">{phase === "ready" ? "Complete" : "Running"}</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${progressPercent(stageStatus)}%` }}
            />
          </div>

          <ul className="mt-5 flex flex-col gap-4">
            {STAGES.map((stage) => (
              <StageRow key={stage.key} label={stage.label} status={stageStatus[stage.key]} />
            ))}
          </ul>

          {(phase === "running" || phase === "error") && (
            <div className="mt-6 flex items-center gap-3 border-t border-neutral-100 pt-4">
              <button
                onClick={handleCancel}
                className="rounded-md border border-neutral-300 px-3.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          )}
          {phase === "ready" && (
            <p className="mt-6 border-t border-neutral-100 pt-4 text-sm text-neutral-400">
              You can close this page — the guide is saved to Guides.
            </p>
          )}
        </div>

        <aside className="h-fit rounded-xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Sources found</h2>
            {readyGuide && <span className="text-xs text-neutral-400">{readyGuide.sources.length}</span>}
          </div>
          {!readyGuide && <p className="mt-3 text-sm text-neutral-400">Sources will appear here as they&apos;re found.</p>}
          {readyGuide && (
            <ul className="mt-3 flex flex-col gap-3">
              {readyGuide.sources.map((source) => (
                <li key={source.url} className="flex items-start gap-2.5">
                  <FileIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">{source.title}</p>
                    <p className="truncate text-xs text-neutral-500">{source.url.replace(/^https?:\/\//, "")}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-400">
            Only official pages are used. Research by Tavily · Models via Tarqa AI.
          </p>
        </aside>
      </div>
    </div>
  );
}

function progressPercent(stageStatus: Record<GenerateStageName, StageStatus>): number {
  const done = STAGES.filter((s) => stageStatus[s.key] === "done").length;
  return Math.round((done / STAGES.length) * 100);
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes} min ${seconds}s`;
}

function StageRow({ label, status }: { label: string; status: StageStatus }) {
  return (
    <li className="flex items-center gap-3">
      <StageIcon status={status} />
      <span className={status === "pending" ? "text-sm text-neutral-400" : "text-sm text-neutral-900"}>{label}</span>
    </li>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "done") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-xs text-white">
        !
      </span>
    );
  }
  if (status === "running") {
    return <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />;
  }
  return <span className="h-6 w-6 shrink-0 rounded-full border-2 border-neutral-200" />;
}
