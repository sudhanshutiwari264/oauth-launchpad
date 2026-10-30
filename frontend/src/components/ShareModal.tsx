"use client";

import { useState } from "react";
import type { OAuthGuide } from "@/lib/types";
import { CopyIcon, MarkdownIcon, XIcon } from "./icons";

function guideToMarkdown(guide: OAuthGuide): string {
  const lines: string[] = [];
  lines.push(`# ${guide.provider_name} OAuth setup`, "");
  lines.push(guide.summary, "");
  lines.push("## Setup steps", "");
  guide.setup_steps.forEach((step, index) => {
    lines.push(`${index + 1}. **${step.title}** (${step.responsible_party}) — ${step.instructions}`);
  });
  if (guide.required_scopes.length > 0) {
    lines.push("", "## Scopes", "");
    guide.required_scopes.forEach((scope) => lines.push(`- \`${scope}\``));
  }
  if (guide.sources.length > 0) {
    lines.push("", "## Sources", "");
    guide.sources.forEach((source) => lines.push(`- [${source.title}](${source.url})`));
  }
  return lines.join("\n");
}

export function ShareModal({ guide, onClose }: { guide: OAuthGuide; onClose: () => void }) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [markdownCopied, setMarkdownCopied] = useState(false);
  const shareUrl = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function copyMarkdown() {
    navigator.clipboard.writeText(guideToMarkdown(guide));
    setMarkdownCopied(true);
    setTimeout(() => setMarkdownCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${guide.provider_name} guide`}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Share {guide.provider_name} guide</h2>
          <button onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-neutral-600">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1.5 text-sm text-neutral-500">
          Anyone with the link can view this guide and check off steps — progress is shared with everyone who has
          the link, since there&apos;s no sign-in.
        </p>

        <label className="mt-5 block text-sm font-medium text-neutral-900">Guide link</label>
        <div className="mt-2 flex gap-2">
          <input
            readOnly
            value={shareUrl}
            className="w-full truncate rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600"
          />
          <button
            onClick={copyLink}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            {linkCopied ? "Copied!" : "Copy link"}
          </button>
        </div>

        <button
          onClick={copyMarkdown}
          className="mt-5 flex w-full items-center gap-3 rounded-lg border border-neutral-200 p-3 text-left transition hover:bg-neutral-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-500">
            <MarkdownIcon className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-neutral-900">
              {markdownCopied ? "Copied as Markdown!" : "Copy as Markdown"}
            </span>
            <span className="block text-xs text-neutral-500">Paste the steps into a ticket, README or doc</span>
          </span>
          <CopyIcon className="h-4 w-4 shrink-0 text-neutral-400" />
        </button>

        <div className="mt-6 flex justify-end border-t border-neutral-100 pt-4">
          <button
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
