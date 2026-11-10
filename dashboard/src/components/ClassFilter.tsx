import { weightTotal, type BenchmarkWeights } from "@/lib/score";

const SCALES: Array<{ key: keyof BenchmarkWeights; label: string }> = [
  { key: "bbq", label: "BBQ" },
  { key: "bbg", label: "BBG" },
  { key: "sycon", label: "SYCON" },
  { key: "wildguard", label: "WildGuard" },
];

type ClassFilterProps = {
  labels: string[];
  draft: ReadonlySet<string>;
  weights: BenchmarkWeights;
  canRecalculate: boolean;
  status: string;
  onToggle: (label: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onWeight: (key: keyof BenchmarkWeights, value: number) => void;
  onRecalculate: () => void;
};

export function ClassFilter({
  labels,
  draft,
  weights,
  canRecalculate,
  status,
  onToggle,
  onSelectAll,
  onClear,
  onWeight,
  onRecalculate,
}: ClassFilterProps) {
  const total = weightTotal(weights);
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Benchmark weights</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            BBQ, BBG, SYCON, and WildGuard each start at 25%. Moving one scale changes the others so the weights still
            sum to 100%. Tests with no score are left out, and the remaining weights are scaled to 100%.
          </p>
        </div>
        <button
          type="button"
          onClick={onRecalculate}
          disabled={!canRecalculate}
          className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Recalculate
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SCALES.map((scale) => (
          <label key={scale.key} className="block" htmlFor={`weight-${scale.key}`}>
            <span className="flex items-center justify-between text-sm font-medium text-ink">
              <span>{scale.label}</span>
              <span className="tabular-nums">{weights[scale.key]}%</span>
            </span>
            <input
              id={`weight-${scale.key}`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={weights[scale.key]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={weights[scale.key]}
              aria-valuetext={`${weights[scale.key]}%`}
              onChange={(event) => onWeight(scale.key, Number(event.target.value))}
              className="mt-2 w-full accent-ink"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-sm font-medium text-ink">Total {total}%</p>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-6">
        <div>
          <h2 className="text-lg font-semibold text-ink">Protected classes</h2>
          <p className="mt-1 text-sm text-muted">
            Choose the classes that count. Recalculate updates this model&apos;s BBQ score, overall score, and BBQ chart.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onSelectAll} className="rounded-lg px-3 py-2 text-sm font-medium text-ink">
            Select all
          </button>
          <button type="button" onClick={onClear} className="rounded-lg px-3 py-2 text-sm font-medium text-ink">
            Clear
          </button>
        </div>
      </div>
      <fieldset className="mt-4">
        <legend className="sr-only">BBQ classes</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {labels.map((label) => (
            <label key={label} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink"
                checked={draft.has(label)}
                onChange={() => onToggle(label)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-4 text-sm text-muted">{status}</p>
    </section>
  );
}
