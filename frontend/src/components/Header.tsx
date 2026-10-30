"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MenuIcon, RocketIcon, SearchIcon, XIcon } from "./icons";
import { HeaderNavLinks, HeaderNavLinksFallback, MobileNavLinks } from "./HeaderNavLinks";

export function Header() {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  // Navigating to /generate while already there is a same-URL no-op in
  // Next.js, so a guide result left on screen from a previous run would
  // otherwise stick around. Always force the URL to actually change (a
  // harmless extra param when coming from elsewhere) so the page remounts
  // with a clean form - see GenerateContentKeyedByUrl.
  function handleNewGuideClick(e: React.MouseEvent) {
    e.preventDefault();
    setMobileOpen(false);
    router.push(`/generate?fresh=${Date.now()}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <span className="flex h-8 w-8 shrink-0 -rotate-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
            <RocketIcon className="h-4.5 w-4.5 rotate-12" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-neutral-900">OAuth Launchpad</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Suspense fallback={<HeaderNavLinksFallback />}>
            <HeaderNavLinks />
          </Suspense>
        </nav>

        <div className="order-last flex w-full items-center gap-3 sm:order-none sm:w-auto sm:flex-1 sm:justify-end">
          <form action="/" className="hidden w-full max-w-xs items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 md:flex">
            <SearchIcon className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              ref={searchInputRef}
              type="text"
              name="q"
              placeholder="Search guides (e.g. Slack, Google...)"
              className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 lg:block">
              ⌘K
            </kbd>
          </form>

          <Link
            href="/generate"
            onClick={handleNewGuideClick}
            className="hidden shrink-0 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 sm:block"
          >
            + New guide
          </Link>

          <button
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition hover:bg-neutral-50 sm:hidden"
          >
            {mobileOpen ? <XIcon className="h-4.5 w-4.5" /> : <MenuIcon className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-neutral-200 px-4 py-3 sm:hidden">
          <div className="flex flex-col gap-0.5">
            <Suspense fallback={null}>
              <MobileNavLinks onNavigate={() => setMobileOpen(false)} />
            </Suspense>
          </div>
          <Link
            href="/generate"
            onClick={handleNewGuideClick}
            className="mt-2 block rounded-lg bg-blue-600 px-3.5 py-2.5 text-center text-sm font-medium text-white transition hover:bg-blue-700"
          >
            + New guide
          </Link>
        </div>
      )}
    </header>
  );
}
