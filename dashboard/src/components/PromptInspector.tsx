"use client";

import { useEffect, useRef, useState } from "react";
import type { BenchmarkName, PromptCard } from "@/lib/examples";

type ProbeTab = "failed" | "passed";

type PromptInspectorProps = {
  model: string;
  benchmark: BenchmarkName;
  axis: string;
  flagged: PromptCard[];
  reference: PromptCard[];
  /** Real counts; the lists hold only the examples the page was sent. */
  flaggedTotal: number;
  referenceTotal: number;
};

function ScoreList({ card }: { card: PromptCard }) {
  return (
    <div className="border-t border-[#d5e2ee] px-5 py-4">
      <p className="text-sm font-semibold text-ink">{card.heading} scores</p>
      <ul className="mt-2 space-y-1.5 text-sm text-ink">
        {card.scores.map((score) => (
          <li key={score.label} className="flex flex-wrap items-baseline gap-2">
            <span
              className={
                score.emphasis
                  ? "rounded bg-[#0B5CAB] px-1.5 py-0.5 text-white"
                  : "rounded bg-[#D6E6F5] px-1.5 py-0.5 underline decoration-[#0B5CAB] decoration-2 underline-offset-2"
              }
            >
              {score.label}
            </span>
            <span className="tabular-nums">{score.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResponseCard({ card }: { card: PromptCard }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#d5e2ee] bg-[#f7f9fc]">
      <header className="border-b border-[#d5e2ee] bg-white px-5 py-3 text-sm font-semibold text-ink">{card.heading}</header>
      <div className="px-5 py-4 text-[15px] leading-7 text-ink">
        <p className="text-sm text-muted">{card.prompt}</p>
        <p className="mt-3">
          {card.lead ? <span>{card.lead} </span> : null}
          {card.highlight ? (
            <mark className="rounded bg-[#D6E6F5] px-1 underline decoration-[#0B5CAB] decoration-2 underline-offset-2">
              {card.highlight}
            </mark>
          ) : null}
        </p>
      </div>
      <ScoreList card={card} />
    </article>
  );
}

const TABS: { id: ProbeTab; label: string }[] = [
  { id: "failed", label: "Failed" },
  { id: "passed", label: "Passed" },
];

export function PromptInspector({ model, benchmark, axis, flagged, reference, flaggedTotal, referenceTotal }: PromptInspectorProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const skipScroll = useRef(true);
  const [tab, setTab] = useState<ProbeTab>(flagged.length > 0 ? "failed" : "passed");
  const [index, setIndex] = useState(0);

  const lists: Record<ProbeTab, PromptCard[]> = {
    failed: flagged,
    passed: reference,
  };
  const cards = lists[tab];
  const count = cards.length;
  const current = cards[index] ?? null;

  useEffect(() => {
    setTab(flagged.length > 0 ? "failed" : "passed");
    setIndex(0);
  }, [model, benchmark, axis, flagged.length, reference.length]);

  useEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [benchmark, axis]);

  function selectTab(next: ProbeTab) {
    setTab(next);
    setIndex(0);
  }

  return (
    <section
      ref={sectionRef}
      aria-label="Probe review"
      className="scroll-mt-6 rounded-2xl border border-[#d5e2ee] bg-white p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Probe review</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">Failed / passed</h3>
          <p className="mt-1 text-sm text-muted">
            {model} · {benchmark} · {axis}. Highlighted text is the evidence for that judgment.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Probe groups">
          {TABS.map((item) => {
            const selected = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectTab(item.id)}
                className={
                  selected
                    ? "rounded-lg bg-[#0B5CAB] px-3 py-2 text-sm font-medium text-white"
                    : "rounded-lg border border-[#d5e2ee] bg-white px-3 py-2 text-sm font-medium text-ink"
                }
              >
                {item.label} {(item.id === "failed" ? flaggedTotal : referenceTotal).toLocaleString("en-US")}
                {lists[item.id].length < (item.id === "failed" ? flaggedTotal : referenceTotal)
                  ? ` · ${lists[item.id].length} shown`
                  : ""}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted">
            {count === 0 ? "0 of 0" : `${index + 1} of ${count}`}
          </span>
          <button
            type="button"
            aria-label="Previous probe"
            disabled={index <= 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            className="h-9 w-9 rounded-lg border border-[#d5e2ee] bg-white text-lg leading-none text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next probe"
            disabled={count === 0 || index >= count - 1}
            onClick={() => setIndex((value) => Math.min(count - 1, value + 1))}
            className="h-9 w-9 rounded-lg border border-[#d5e2ee] bg-white text-lg leading-none text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-4" aria-live="polite">
        {current ? (
          <ResponseCard key={current.id} card={current} />
        ) : (
          <p className="rounded-xl border border-dashed border-[#d5e2ee] bg-[#f7f9fc] px-4 py-6 text-sm text-muted">
            No {tab} for this score.
          </p>
        )}
      </div>
    </section>
  );
}
