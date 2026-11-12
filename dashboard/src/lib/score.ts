import type { BiasGen } from "@/lib/types";

/** Scores come from the evaluation backend (`raieval score`); this file only arranges them. */

export type Verdict = "pass" | "fail" | "insufficient" | "unset";

export type RatePoint = {
  label: string;
  rate: number | null;
  n?: number;
};

export type ModelSummary = {
  model: string;
  composite: number | null;
  /** Tests the overall score combines (a test with no results is left out, weights rescaled). */
  compositeIncludes: string[];
  verdict: Verdict;
  bbqScore: number | null;
  bbgScore: number | null;
  wgScore: number | null;
  syconScore: number | null;
  bbqN: number | null;
  bbgN: number | null;
  wgN: number | null;
  syconN: number | null;
  bbgBiasGen: BiasGen | null;
  /** Tests scored on part of the data, with the backend's note; `kind` is how to show it. */
  subsets: Array<{ test: string; note: string; kind: "lite" | "sample" }>;
  bbqByClass: RatePoint[];
  bbgByClass: RatePoint[];
  wgBySheet: RatePoint[];
  syconByClass: RatePoint[];
};

export type ScoreSummaryRow = {
  model: string;
  test: string;
  score: number | null;
  n: number | null;
  verdict: string | null;
  weight: number | null;
  /** Set when the test used part of the data: "lite: ..." or "test sample: ...; not a full result". */
  subset: string | null;
  includes: string[] | null;
};

export type ScoreClassRow = {
  model: string;
  test: string;
  cls: string;
  failureRate: number;
  n: number;
};

export function formatScore(score: number | null): string {
  if (score === null) return "—";
  return score.toFixed(4);
}

export function formatSigned(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

export type ChartRow = Record<string, string | number | null>;

export const AVERAGE_SERIES = "Run average";

function meanOf(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

/** Axes come from the selected model. The second series is the run average and does not name other models. */
export function reportChartRows(
  summaries: ModelSummary[],
  model: string,
  pointsFor: (summary: ModelSummary) => RatePoint[],
): ChartRow[] {
  const selected = summaries.find((summary) => summary.model === model);
  if (!selected) return [];
  return pointsFor(selected).map((point) => ({
    axis: point.label,
    [model]: point.rate,
    [AVERAGE_SERIES]: meanOf(
      summaries.map((summary) => pointsFor(summary).find((item) => item.label === point.label)?.rate ?? null),
    ),
  }));
}

function classPoints(rows: ScoreClassRow[], model: string, test: string): RatePoint[] {
  return rows
    .filter((row) => row.model === model && row.test === test)
    .map((row) => ({ label: row.cls, rate: row.failureRate, n: row.n }));
}

function testValue(rows: ScoreSummaryRow[], model: string, test: string): ScoreSummaryRow | null {
  return rows.find((row) => row.model === model && row.test === test) ?? null;
}

/**
 * The backend gives a verdict per test only when the evaluation team has set a cap. The overall
 * score has no verdict of its own: it fails if any test fails, passes if every scored test passes.
 */
function overallVerdict(tests: Array<ScoreSummaryRow | null>): Verdict {
  const verdicts = tests.filter((row): row is ScoreSummaryRow => row !== null).map((row) => row.verdict);
  if (verdicts.length === 0 || verdicts.every((verdict) => verdict === null)) return "unset";
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.every((verdict) => verdict === "pass")) return "pass";
  return "insufficient";
}

/** Builds model cards from the backend's score tables. Missing tests stay blank. */
export function summariesFromTables(
  summaryRows: ScoreSummaryRow[],
  classRows: ScoreClassRow[],
  biasGen: Record<string, BiasGen>,
): ModelSummary[] {
  const models = uniqueInOrder(summaryRows.map((row) => row.model));
  return models.map((model) => {
    const overall = testValue(summaryRows, model, "overall");
    const bbq = testValue(summaryRows, model, "BBQ");
    const bbg = testValue(summaryRows, model, "BBG");
    const safety = testValue(summaryRows, model, "Safety");
    const pushback = testValue(summaryRows, model, "Pushback");
    return {
      model,
      composite: overall?.score ?? null,
      compositeIncludes: overall?.includes ?? [],
      verdict: overallVerdict([bbq, bbg, safety, pushback]),
      bbqScore: bbq?.score ?? null,
      bbgScore: bbg?.score ?? null,
      wgScore: safety?.score ?? null,
      syconScore: pushback?.score ?? null,
      bbqN: bbq?.n ?? null,
      bbgN: bbg?.n ?? null,
      wgN: safety?.n ?? null,
      syconN: pushback?.n ?? null,
      bbgBiasGen: biasGen[model] ?? null,
      subsets: summaryRows
        .filter((row) => row.model === model && row.subset)
        .map((row) => ({
          test: row.test,
          note: row.subset as string,
          kind: (row.subset as string).startsWith("test sample") ? ("sample" as const) : ("lite" as const),
        })),
      bbqByClass: classPoints(classRows, model, "BBQ"),
      bbgByClass: classPoints(classRows, model, "BBG"),
      wgBySheet: classPoints(classRows, model, "Safety"),
      syconByClass: classPoints(classRows, model, "Pushback"),
    };
  });
}
