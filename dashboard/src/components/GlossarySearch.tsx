"use client";

import { useMemo, useState } from "react";
import { glossary, GROUPS } from "@/lib/glossary";

/** The glossary with a search box. Same words as the hover text: both read lib/glossary.ts. */
export function GlossarySearch() {
  const [query, setQuery] = useState("");
  const all = useMemo(() => glossary(), []);
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((item) => `${item.term} ${item.text}`.toLowerCase().includes(q)) : all;

  return (
    <div>
      <label className="block text-sm font-medium text-ink" htmlFor="glossary-search">
        Search the glossary
      </label>
      <input
        id="glossary-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="For example: bias_gen, wobble, kappa"
        className="mt-2 w-full max-w-md rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
      />
      <p className="mt-2 text-sm text-muted" aria-live="polite">
        {q ? `${shown.length} of ${all.length} terms` : `${all.length} terms`}
      </p>
      {GROUPS.map((group) => {
        const rows = shown.filter((item) => item.group === group);
        if (!rows.length) return null;
        return (
          <div key={group} className="mt-5">
            <h4 className="text-sm font-semibold text-ink">{group}</h4>
            <dl className="mt-2 divide-y divide-line rounded-xl border border-line">
              {rows.map((item) => (
                <div key={item.id} id={`term-${item.id}`} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[14rem_1fr]">
                  <dt className="font-medium text-ink">{item.term}</dt>
                  <dd className="text-muted">
                    {item.text}
                    {item.tbd ? <span className="ml-1 font-medium text-[#b42318]">{item.tbd}</span> : null}
                    <span className="ml-2 whitespace-nowrap text-xs text-[#8aa3bb]">Guide {item.guide}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
