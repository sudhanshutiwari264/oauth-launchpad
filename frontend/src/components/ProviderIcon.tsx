"use client";

import { useState } from "react";

// Real logo, fetched from Google's favicon service for the provider's own
// domain - no API key needed, works for virtually any public site. If the
// image fails to load (or hasn't loaded yet), we fall back to a colored
// badge showing the provider's initial instead of bundling logo assets.
const PALETTE = [
  "bg-slate-900 text-white",
  "bg-blue-600 text-white",
  "bg-purple-600 text-white",
  "bg-emerald-600 text-white",
  "bg-amber-500 text-white",
  "bg-rose-600 text-white",
  "bg-sky-600 text-white",
  "bg-indigo-600 text-white",
];

function colorForName(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function ProviderIcon({
  name,
  domain,
  size = "md",
}: {
  name: string;
  domain?: string;
  size?: "md" | "lg";
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const pixelSize = size === "lg" ? 44 : 36;
  const dimensions = size === "lg" ? "h-11 w-11 text-lg" : "h-9 w-9 text-sm";

  if (domain && !logoFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable domains; next/image's optimizer isn't worth configuring here
      <img
        src={`https://www.google.com/s2/favicons?sz=${pixelSize * 2}&domain=${encodeURIComponent(domain)}`}
        alt={`${name} logo`}
        width={pixelSize}
        height={pixelSize}
        className={`${dimensions} shrink-0 rounded-md border border-slate-200 bg-white object-contain p-1`}
        onError={() => setLogoFailed(true)}
      />
    );
  }

  return (
    <span
      className={`flex ${dimensions} shrink-0 items-center justify-center rounded-md font-semibold ${colorForName(name)}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
