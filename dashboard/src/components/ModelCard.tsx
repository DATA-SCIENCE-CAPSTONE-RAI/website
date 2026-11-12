import { formatScore, formatSigned, type ModelSummary } from "@/lib/score";

const VERDICT_STYLE = {
  pass: { label: "Pass", className: "bg-[#1E8E4E] text-white" },
  fail: { label: "Fail", className: "bg-[#D14343] text-white" },
  insufficient: { label: "Insufficient data", className: "bg-[#E6EDF5] text-[#3E5166]" },
  unset: { label: "Not set", className: "bg-[#E6EDF5] text-[#3E5166]" },
} as const;

const COMPONENTS: Array<{
  score: "bbqScore" | "bbgScore" | "wgScore" | "syconScore";
  n: "bbqN" | "bbgN" | "wgN" | "syconN";
  label: string;
  chip: string;
}> = [
  { score: "bbqScore", n: "bbqN", label: "BBQ", chip: "#D6E6F5" },
  { score: "bbgScore", n: "bbgN", label: "BBG", chip: "#C5D9F0" },
  { score: "wgScore", n: "wgN", label: "Safety", chip: "#E8F1FA" },
  { score: "syconScore", n: "syconN", label: "Pushback", chip: "#B7D0EA" },
];

type ModelCardProps = {
  summary: ModelSummary;
};

export function ModelCard({ summary }: ModelCardProps) {
  const verdict = VERDICT_STYLE[summary.verdict];

  return (
    <article className="h-full rounded-2xl border border-line bg-white p-5 text-left shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-ink">{summary.model}</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${verdict.className}`}>{verdict.label}</span>
      </div>
      <p className="mt-5 text-4xl font-semibold tracking-tight text-ink">{formatScore(summary.composite)}</p>
      <p className="mt-1 text-sm text-muted">
        Overall score · higher is better
        {summary.compositeIncludes.length ? ` · combines ${summary.compositeIncludes.join(", ")}` : ""}
      </p>
      <dl className="mt-5 space-y-2 text-sm">
        {COMPONENTS.map((component) => (
          <div key={component.score} className="flex items-center justify-between gap-3">
            <dt className="rounded px-1.5 py-0.5" style={{ backgroundColor: component.chip }}>
              {component.label}
            </dt>
            <dd className="font-medium tabular-nums text-ink">
              {formatScore(summary[component.score])}
              {summary[component.n] === null ? "" : ` · ${summary[component.n]}`}
              {(() => {
                const subset = summary.subsets.find((item) => item.test === component.label);
                return subset ? (
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${
                      subset.kind === "sample" ? "bg-[#fff0c2] text-[#6b4e00]" : "bg-[#e6edf5] text-[#3E5166]"
                    }`}
                    title={subset.note}
                  >
                    {subset.kind}
                  </span>
                ) : null;
              })()}
            </dd>
          </div>
        ))}
      </dl>
      {summary.subsets.some((item) => item.kind === "lite") ? (
        <p className="mt-4 text-sm text-muted">
          Lite:{" "}
          {COMPONENTS.map((component) => component.label)
            .filter((test) => summary.subsets.some((item) => item.kind === "lite" && item.test === test))
            .join(", ")}{" "}
          used a
          quarter of the data. Run full for the results you report.
        </p>
      ) : null}
      {summary.subsets
        .filter((item) => item.kind === "sample")
        .map((item) => (
          <p key={item.test} className="mt-3 rounded-lg bg-[#fff6e0] px-3 py-2 text-sm text-ink">
            {item.test}: {item.note}.
          </p>
        ))}
      {summary.bbgBiasGen ? (
        <p className="mt-4 text-sm text-muted">
          BBG bias_gen {formatSigned(summary.bbgBiasGen.value)}
          {summary.bbgBiasGen.low !== null && summary.bbgBiasGen.high !== null
            ? ` (95% CI ${formatSigned(summary.bbgBiasGen.low)} to ${formatSigned(summary.bbgBiasGen.high)})`
            : ""}
          {summary.bbgBiasGen.reading ? `: ${summary.bbgBiasGen.reading}` : ""}. Positive leans toward the stereotype.
        </p>
      ) : null}
    </article>
  );
}
