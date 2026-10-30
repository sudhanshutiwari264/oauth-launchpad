"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_LINKS = [
  { href: "/", label: "Guides" },
  { href: "/integrations", label: "Integrations" },
  { href: "/about", label: "About" },
];

function isLinkActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Split out from Header so usePathname() (needed only for active-link
// styling) doesn't force the whole header - and by extension every page,
// since Header lives in the root layout - into dynamic rendering. Wrapped
// in <Suspense> by Header; HeaderNavLinksFallback covers the static shell.
export function HeaderNavLinks() {
  const pathname = usePathname();

  return (
    <>
      {NAV_LINKS.map((link) => {
        const isActive = isLinkActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`hidden border-b-2 py-1 text-sm font-medium transition sm:block ${
              isActive ? "border-blue-600 text-blue-600" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}

export function HeaderNavLinksFallback() {
  return (
    <>
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="hidden border-b-2 border-transparent py-1 text-sm font-medium text-neutral-500 transition hover:text-neutral-900 sm:block"
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

export function MobileNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {NAV_LINKS.map((link) => {
        const isActive = isLinkActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`rounded-lg px-3 py-2.5 text-[15px] font-medium transition ${
              isActive ? "bg-blue-50 text-blue-700" : "text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
