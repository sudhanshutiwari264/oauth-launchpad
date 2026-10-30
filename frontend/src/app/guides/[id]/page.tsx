"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getGuide, recheckGuide, updateStepCompletion, ApiError } from "@/lib/api";
import type { ApprovalStatus, OAuthGuide, ResponsibleParty, SetupPath } from "@/lib/types";
import { ComplexityBadge, EffortBadge, reviewNoteText } from "@/components/Badge";
import { ProviderIcon } from "@/components/ProviderIcon";
import { ShareModal } from "@/components/ShareModal";
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  QuestionIcon,
  RefreshIcon,
  ShareIcon,
  ShieldIcon,
} from "@/components/icons";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "setup-steps", label: "Setup steps" },
  { id: "requirements", label: "Requirements" },
  { id: "scopes", label: "Scopes" },
  { id: "sources", label: "Sources" },
  { id: "open-questions", label: "Open questions" },
] as const;

export default function GuideDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading guide...</p>}>
      <GuideDetailContent />
    </Suspense>
  );
}

function GuideDetailContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const justGenerated = searchParams.get("generated") === "1";

  const [guide, setGuide] = useState<OAuthGuide | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [recheckError, setRecheckError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    getGuide(id)
      .then(setGuide)
      .catch((err: ApiError) => setLoadError(err.message));
  }, [id]);

  useEffect(() => {
    if (!guide) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-100px 0px -70% 0px" }
    );
    for (const section of SECTIONS) {
      const el = sectionRefs.current[section.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [guide]);

  async function handleToggleStep(stepId: string, completed: boolean) {
    if (!guide) return;
    const previousSteps = guide.setup_steps;
    setGuide({
      ...guide,
      setup_steps: guide.setup_steps.map((s) => (s.id === stepId ? { ...s, completed } : s)),
    });
    try {
      await updateStepCompletion(guide.id, stepId, completed);
    } catch {
      setGuide({ ...guide, setup_steps: previousSteps });
    }
  }

  async function handleRecheck() {
    if (!guide || rechecking) return;
    setRechecking(true);
    setRecheckError(null);
    try {
      const updated = await recheckGuide(guide.id);
      setGuide(updated);
    } catch (err) {
      setRecheckError(err instanceof ApiError ? err.message : "Could not re-check sources.");
    } finally {
      setRechecking(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-red-600">Could not load this guide: {loadError}</p>;
  }
  if (!guide) {
    return <p className="text-sm text-neutral-500">Loading guide...</p>;
  }

  const completedSteps = guide.setup_steps.filter((s) => s.completed).length;
  const reviewText = reviewNoteText(guide.approval_status) ?? "No review needed";

  return (
    <div>
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-neutral-400">
        <Link href="/" className="hover:text-neutral-700">
          Guides
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="text-neutral-600">{guide.provider_name}</span>
      </nav>

      {justGenerated && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div>
            <p className="font-medium text-emerald-900">Guide saved!</p>
            <p className="text-sm text-emerald-700">You can share this link with others or bookmark it.</p>
          </div>
          <button
            onClick={() => setShareOpen(true)}
            className="shrink-0 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
          >
            Share
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ProviderIcon name={guide.provider_name} domain={guide.canonical_domain} size="lg" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">{guide.provider_name} OAuth setup</h1>
            <p className="text-sm text-neutral-500">{guide.canonical_domain}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={handleRecheck}
            disabled={rechecking}
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
          >
            <RefreshIcon className={`h-3.5 w-3.5 ${rechecking ? "animate-spin" : ""}`} />
            {rechecking ? "Re-checking…" : "Re-check sources"}
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            <ShareIcon className="h-3.5 w-3.5" />
            Share
          </button>
        </div>
      </div>
      {recheckError && <p className="mt-2 text-sm text-red-600">{recheckError}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ComplexityBadge complexity={guide.setup_complexity} suffix="effort" />
        <EffortBadge hours={guide.estimated_hands_on_setup_hours} />
        <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
          <ShieldIcon className="h-3.5 w-3.5" />
          {reviewText}
        </span>
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        Generated {new Date(guide.last_researched_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}{" "}
        from {guide.sources.length} official {guide.sources.length === 1 ? "source" : "sources"}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="hidden h-fit lg:sticky lg:top-24 lg:block">
          <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400">ON THIS PAGE</p>
          <ul className="flex flex-col gap-0.5 border-l border-neutral-200">
            {SECTIONS.map((section) => {
              const count =
                section.id === "setup-steps"
                  ? `${completedSteps}/${guide.setup_steps.length}`
                  : section.id === "sources"
                    ? guide.sources.length
                    : section.id === "open-questions"
                      ? guide.unknowns.length
                      : null;
              const isActive = activeSection === section.id;
              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className={`flex items-center justify-between py-1.5 pl-3 text-sm transition ${
                      isActive
                        ? "border-l-2 border-blue-600 -ml-px font-medium text-blue-600"
                        : "text-neutral-500 hover:text-neutral-900"
                    }`}
                  >
                    {section.label}
                    {count !== null && <span className="text-xs text-neutral-400">{count}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          <Section id="overview" title="Overview" refCb={(el) => (sectionRefs.current.overview = el)}>
            <p className="text-[15px] leading-relaxed text-neutral-700">{guide.summary}</p>

            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <p className="text-xs font-medium text-blue-700">RECOMMENDED SETUP PATH</p>
              <p className="mt-1 font-medium text-neutral-900">{setupPathLabel(guide.recommended_setup_path)}</p>
              <p className="mt-1 text-sm text-neutral-600">{setupPathExplainer(guide.recommended_setup_path)}</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatBox
                label="Estimated effort"
                value={`~${guide.estimated_hands_on_setup_hours} ${guide.estimated_hands_on_setup_hours === 1 ? "hour" : "hours"}`}
              />
              <StatBox label="Provider review" value={approvalLabel(guide.approval_status)} />
              <StatBox label="Who's involved" value={whosInvolved(guide.setup_steps.map((s) => s.responsible_party))} />
              {guide.estimated_external_wait_days !== null && (
                <StatBox
                  label="External wait time"
                  value={`~${guide.estimated_external_wait_days} ${guide.estimated_external_wait_days === 1 ? "day" : "days"}`}
                />
              )}
            </div>
          </Section>

          <Section
            id="setup-steps"
            title="Setup steps"
            refCb={(el) => (sectionRefs.current["setup-steps"] = el)}
            aside={
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">
                  {completedSteps} of {guide.setup_steps.length} done
                </span>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${guide.setup_steps.length ? (completedSteps / guide.setup_steps.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            }
          >
            <p className="mb-4 text-sm text-neutral-500">
              Tick off each step as you go — progress is saved on the guide and visible to anyone with the link.
            </p>
            {guide.setup_steps.length === 0 ? (
              <p className="text-sm text-neutral-500">No setup steps recorded for this guide.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {guide.setup_steps.map((step, index) => (
                  <li
                    key={step.id}
                    className={`rounded-xl border p-4 transition ${step.completed ? "border-emerald-200 bg-emerald-50/40" : "border-neutral-200 bg-white"}`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => handleToggleStep(step.id, !step.completed)}
                        aria-label={step.completed ? "Mark step incomplete" : "Mark step complete"}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                          step.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-neutral-300"
                        }`}
                      >
                        {step.completed && <CheckIcon className="h-3 w-3" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-neutral-900">
                            <span className="mr-1.5 text-neutral-400">{String(index + 1).padStart(2, "0")}</span>
                            {step.title}
                          </p>
                          <PartyBadge party={step.responsible_party} />
                        </div>
                        <p className="mt-1 text-sm text-neutral-600">{step.instructions}</p>
                        {/redirect/i.test(step.title) && guide.redirect_uri_requirements && (
                          <RedirectCodeBox text={guide.redirect_uri_requirements} />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section id="requirements" title="Requirements" refCb={(el) => (sectionRefs.current.requirements = el)}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 p-4">
                <h3 className="text-sm font-semibold text-neutral-900">Before you start</h3>
                {guide.prerequisites.length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-500">None recorded.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm text-neutral-700">
                    {guide.prerequisites.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-neutral-200 p-4">
                <h3 className="text-sm font-semibold text-neutral-900">Redirect URI rules</h3>
                {guide.redirect_uri_requirements ? (
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm text-neutral-700">
                    {splitIntoBullets(guide.redirect_uri_requirements).map((sentence) => (
                      <li key={sentence} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                        {sentence}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-neutral-500">Not recorded.</p>
                )}
              </div>
            </div>

            {guide.blockers.length > 0 && (
              <div className="mt-6 border-t border-neutral-100 pt-5">
                <h3 className="text-sm font-semibold text-neutral-900">Common blockers &amp; recovery</h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {guide.blockers.map((issue) => {
                    const action = guide.recovery_actions.find((a) => a.for_blocker === issue);
                    return (
                      <li key={issue} className="rounded-xl border border-neutral-200 p-4">
                        <p className="font-medium text-neutral-900">{issue}</p>
                        {action ? (
                          <>
                            <p className="mt-1 text-sm text-neutral-600">
                              <span className="font-medium">Recovery: </span>
                              {action.recovery_step}
                            </p>
                            <p className="mt-1 text-sm text-neutral-600">
                              <span className="font-medium">Next action: </span>
                              {action.next_action}
                            </p>
                            <div className="mt-2">
                              <PartyBadge party={action.responsible_party} />
                            </div>
                          </>
                        ) : (
                          <p className="mt-1 text-sm text-neutral-500">No recovery steps recorded for this blocker.</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Section>

          <Section id="scopes" title="Scopes" refCb={(el) => (sectionRefs.current.scopes = el)}>
            <p className="mb-4 text-sm text-neutral-500">
              Request only what you need — each extra scope can lengthen review.
            </p>
            {guide.required_scopes.length === 0 ? (
              <p className="text-sm text-neutral-500">No specific scopes recorded.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-neutral-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-400">
                      <th className="px-4 py-2 font-medium">SCOPE</th>
                      <th className="px-4 py-2 font-medium">REVIEW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guide.required_scopes.map((scope) => (
                      <tr key={scope} className="border-b border-neutral-100 last:border-b-0">
                        <td className="px-4 py-2.5">
                          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">{scope}</code>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-600">{scopeReviewLabel(guide.approval_status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section id="sources" title="Sources" refCb={(el) => (sectionRefs.current.sources = el)}>
            {guide.sources.length === 0 ? (
              <p className="text-sm text-neutral-500">No sources recorded.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {guide.sources.map((source, index) => (
                  <li key={source.url} className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-500">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 font-medium text-blue-600 hover:underline"
                      >
                        {source.title}
                        <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
                      </a>
                      <p className="truncate text-sm text-neutral-500">{source.url}</p>
                      <span
                        className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs ${
                          source.verification_status === "verified"
                            ? "bg-emerald-100 text-emerald-700"
                            : source.verification_status === "conflicting"
                              ? "bg-red-100 text-red-700"
                              : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {source.verification_status}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section id="open-questions" title="Open questions" refCb={(el) => (sectionRefs.current["open-questions"] = el)}>
            {guide.unknowns.length === 0 ? (
              <p className="text-sm text-neutral-500">No open questions — the research was conclusive.</p>
            ) : (
              <>
                <p className="mb-4 text-sm text-neutral-500">
                  The docs don&apos;t answer these clearly. Confirm with {guide.provider_name} before you plan a launch
                  date.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {guide.unknowns.map((unknown) => (
                    <div key={unknown} className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                      <QuestionIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <p className="text-sm text-neutral-700">{unknown}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>

          <div className="mt-8 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-neutral-900">Was this guide accurate?</p>
            {feedback ? (
              <p className="text-sm text-neutral-500">Thanks for the feedback!</p>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setFeedback("yes")}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => setFeedback("no")}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  No, report an issue
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {shareOpen && <ShareModal guide={guide} onClose={() => setShareOpen(false)} />}
    </div>
  );
}

function Section({
  id,
  title,
  aside,
  refCb,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  refCb: (el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section id={id} ref={refCb} className="scroll-mt-24 border-t border-neutral-200 py-8 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-medium text-neutral-900">{value}</p>
    </div>
  );
}

function PartyBadge({ party }: { party: ResponsibleParty }) {
  const label = party.charAt(0).toUpperCase() + party.slice(1);
  return (
    <span className="shrink-0 rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-600">
      {label}
    </span>
  );
}

function RedirectCodeBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <code className="truncate text-xs text-neutral-700">{text}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex shrink-0 items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800"
      >
        <CopyIcon className="h-3.5 w-3.5" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function setupPathLabel(path: SetupPath): string {
  if (path === "custom") return "Register your own OAuth app";
  if (path === "managed") return "A managed OAuth app may be sufficient";
  return "Unclear from the evidence we have";
}

function setupPathExplainer(path: SetupPath): string {
  if (path === "custom") {
    return "Registration looks self-serve and fast enough that your own app gives you full control over branding without costing much time.";
  }
  if (path === "managed") {
    return "Custom registration looks slow or review-gated here, so a pre-approved managed OAuth app (via an auth aggregator) may get you running faster.";
  }
  return "The documentation we reviewed didn't give a clear enough signal to recommend custom vs. managed — worth a quick check before you decide.";
}

function approvalLabel(status: ApprovalStatus): string {
  if (status === "required") return "Required";
  if (status === "not_required") return "Not required";
  return "Unknown";
}

function scopeReviewLabel(status: ApprovalStatus): string {
  if (status === "required") return "May be required";
  if (status === "not_required") return "Not required";
  return "Unclear";
}

function whosInvolved(parties: ResponsibleParty[]): string {
  const unique = Array.from(new Set(parties));
  if (unique.length === 0) return "Developer";
  const labels = unique.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  if (labels.length === 1) return `${labels[0]} only`;
  return labels.join(", then ");
}

function splitIntoBullets(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.length > 0 ? sentences : [text];
}
