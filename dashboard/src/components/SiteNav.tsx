"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/eval", label: "Evaluation" },
  { href: "/", label: "Scores" },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
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
