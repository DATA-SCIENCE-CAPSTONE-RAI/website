"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/eval", label: "Evaluation" },
  { href: "/", label: "Scores" },
  { href: "/methodology", label: "Methodology" },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:gap-x-6 sm:px-6">
        <span className="text-sm font-semibold text-ink">Responsible AI</span>
        {LINKS.map((link) => {
          const current = path === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={current ? "text-sm font-medium text-ink underline underline-offset-4" : "text-sm text-muted"}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
