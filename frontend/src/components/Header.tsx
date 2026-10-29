"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoMarkIcon } from "./icons";

export function Header() {
  const router = useRouter();

  // Navigating to /generate while already there is a same-URL no-op in
  // Next.js, so a guide result left on screen from a previous run would
  // otherwise stick around. Always force the URL to actually change (a
  // harmless extra param when coming from elsewhere) so the page remounts
  // with a clean form - see GenerateContentKeyedByUrl. Deliberately avoids
  // usePathname() here: reading it in a component rendered from the root
  // layout blocks prerendering for every route.
  function handleNewGuideClick(e: React.MouseEvent) {
    e.preventDefault();
    router.push(`/generate?fresh=${Date.now()}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white">
            <LogoMarkIcon className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-neutral-900">OAuth Launchpad</span>
        </Link>
        <nav className="flex items-center gap-7">
          <Link href="/guides" className="hidden text-sm text-neutral-500 transition hover:text-neutral-900 sm:block">
            Guides
          </Link>
          <Link
            href="/#how-it-works"
            className="hidden text-sm text-neutral-500 transition hover:text-neutral-900 sm:block"
          >
            How it works
          </Link>
          <Link href="/about" className="hidden text-sm text-neutral-500 transition hover:text-neutral-900 sm:block">
            About
          </Link>
          <Link
            href="/generate"
            onClick={handleNewGuideClick}
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3.5 py-1.5 text-sm font-medium text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-50"
          >
            <span className="text-base leading-none">+</span> New guide
          </Link>
        </nav>
      </div>
    </header>
  );
}
