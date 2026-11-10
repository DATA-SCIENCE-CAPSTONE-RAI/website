/** Setup rules mirrored from tool-backend/raieval/run/runner.py so the preview matches that contract. */

export const DEMO_MODEL = "demo/random";
export const MOCK_MODEL = "mockllm/model";

export const STAGES = [
  { id: "mcq", label: "Stage 1: multiple choice (BBQ format)", test: "BBQ" },
  { id: "open", label: "Stage 2: open-ended stories (BBG format)", test: "BBG" },
  { id: "safety", label: "Stage 3: safety (WildGuardTest)", test: "Safety" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const TESTS = ["BBQ", "BBG", "Safety", "Pushback"] as const;
export type TestName = (typeof TESTS)[number];
export type EvalWeights = Record<TestName, number>;

export const DEFAULT_EVAL_WEIGHTS: EvalWeights = { BBQ: 25, BBG: 25, Safety: 25, Pushback: 25 };

export const TEST_LABELS: Record<TestName, string> = {
  BBQ: "BBQ (stage 1)",
  BBG: "BBG (stage 2)",
  Safety: "WildGuardTest (stage 3)",
  Pushback: "Pushback / sycophancy (SYCON)",
};

/** Team NY classes from data_collection config/categories.yaml. */
export const NY_CLASSES: Array<{ id: string; label: string }> = [
  { id: "ny_age", label: "Age" },
  { id: "ny_arrest_record", label: "Arrest record" },
  { id: "ny_citizenship", label: "Citizenship or immigration" },
  { id: "ny_conviction_record", label: "Conviction record" },
  { id: "ny_creed_religion", label: "Creed or religion" },
  { id: "ny_disability", label: "Disability" },
  { id: "ny_dv_victim_status", label: "DV victim status" },
  { id: "ny_familial_status", label: "Familial status" },
  { id: "ny_gender_identity", label: "Gender identity or expression" },
  { id: "ny_genetic", label: "Genetic characteristics" },
  { id: "ny_marital_status", label: "Marital status" },
  { id: "ny_military_status", label: "Military status" },
  { id: "ny_national_origin", label: "National origin" },
  { id: "ny_pregnancy", label: "Pregnancy-related condition" },
  { id: "ny_race_color", label: "Race or color" },
  { id: "ny_retaliation", label: "Retaliation" },
  { id: "ny_sex", label: "Sex" },
  { id: "ny_sexual_orientation", label: "Sexual orientation" },
  { id: "ny_source_of_income", label: "Lawful source of income" },
];

/** Lite release: 45 templates per class, 8 MCQ items and 2 open items each. Safety is the full gated set. */
const LITE_PER_CLASS = { mcq: 45 * 8, open: 45 * 2 } as const;
const SAFETY_ITEMS = 1699;

export type EvalDraft = {
  model: string;
  stages: StageId[];
  lite: boolean;
  categories: string[];
  judges: string;
  weights: EvalWeights;
};

export function rebalanceEvalWeights(current: EvalWeights, key: TestName, nextValue: number): EvalWeights {
  const requested = Math.round(Math.min(100, Math.max(0, nextValue)));
  const others = TESTS.filter((item) => item !== key);
  const remainder = 100 - requested;
  const otherSum = others.reduce((sum, item) => sum + current[item], 0);
  const next: EvalWeights = { ...current, [key]: requested };
  if (otherSum === 0) {
    const base = Math.floor(remainder / others.length);
    let leftover = remainder - base * others.length;
    for (const item of others) {
      next[item] = base + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover -= 1;
    }
    return next;
  }
  const raw = others.map((item) => (current[item] / otherSum) * remainder);
  const floored = raw.map((value) => Math.floor(value));
  let leftover = remainder - floored.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - floored[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const item of order) {
    if (leftover <= 0) break;
    floored[item.index] += 1;
    leftover -= 1;
  }
  others.forEach((item, index) => {
    next[item] = floored[index];
  });
  return next;
}

export function weightProblems(weights: EvalWeights): string[] {
  if (TESTS.some((test) => weights[test] < 0)) return ["Weights cannot be negative."];
  const total = TESTS.reduce((sum, test) => sum + weights[test], 0);
  if (total !== 100) return [`Weights add up to ${total}%; they must add up to 100%.`];
  return [];
}

/** Reasons start() would fail before the slower release checks. Safety prompts are not on this machine. */
export function problems(draft: EvalDraft): string[] {
  const out: string[] = [];
  if (draft.stages.length === 0) out.push("Pick at least one stage.");
  if ((draft.stages.includes("mcq") || draft.stages.includes("open")) && draft.categories.length === 0) {
    out.push("Pick at least one protected class.");
  }
  if (draft.stages.includes("safety")) {
    out.push(
      "The safety stage needs the WildGuardTest prompts locally: add HF_TOKEN to .env and run `make wildguardtest`.",
    );
  }
  if (!/^[\w.-]+\/\S+$/.test(draft.model.trim())) {
    out.push("Model must look like provider/model, e.g. openai/gpt-4o-mini.");
  }
  out.push(...weightProblems(draft.weights));
  return out;
}

export function warnings(draft: EvalDraft): string[] {
  const notes: string[] = [];
  const model = draft.model.trim();
  if (model !== DEMO_MODEL && model !== MOCK_MODEL) {
    notes.push("Credentials for this provider are checked on the evaluation machine. This preview does not read API keys.");
  }
  if (draft.judges.trim()) {
    notes.push("Judge models are saved with the setup. Judging runs later, as its own step, and is not part of this run.");
  }
  if (!draft.lite) {
    notes.push("Item counts for a full split are computed by the evaluation package from the release. This preview only knows the lite counts.");
  }
  notes.push("Pushback is not built yet, so that weight is recorded and then left out of the overall score.");
  return notes;
}

/** Item counts for the selected stages. Null means this preview cannot compute that count. */
export function plan(draft: EvalDraft): Record<StageId, number | null> {
  const selected = draft.categories.length;
  const counts = {} as Record<StageId, number | null>;
  for (const stage of draft.stages) {
    if (stage === "safety") counts.safety = SAFETY_ITEMS;
    else if (!draft.lite) counts[stage] = null;
    else counts[stage] = LITE_PER_CLASS[stage] * selected;
  }
  return counts;
}

export function planTotal(counts: Record<string, number | null>): number | null {
  const values = Object.values(counts);
  if (values.length === 0 || values.some((value) => value === null)) return null;
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}
