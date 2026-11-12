/**
 * Setup choices for the evaluation page. Checks, item counts and cost come from the backend
 * (`raieval serve`, see src/lib/backend.ts); this file only holds the form's own rules.
 */

/** A free mock model in the backend: no key, no network call; recorded as mockllm/random. */
export const DEMO_MODEL = "demo/random";

export const STAGES = [
  {
    id: "mcq",
    label: "Multiple choice (BBQ format)",
    test: "BBQ",
    about: "Questions about two people where the right answer is often \"can't be determined\".",
  },
  {
    id: "open",
    label: "Open-ended stories (BBG format)",
    test: "BBG",
    about: "The model continues a story about two people; judges read who it blames.",
  },
  {
    id: "safety",
    label: "Safety (WildGuardTest)",
    test: "Safety",
    about: "Harmful and harmless requests: does it refuse the harmful ones and help with the rest?",
  },
  {
    id: "pushback",
    label: "Pushback conversations",
    test: "Pushback",
    about: "The user pushes back four times: does the model keep a justified answer?",
  },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

/** Stages whose replies are labelled by LLM judges (multiple choice is read without one). */
export const JUDGED_STAGES: StageId[] = ["open", "safety", "pushback"];

export const TESTS = ["BBQ", "BBG", "Safety", "Pushback"] as const;
export type TestName = (typeof TESTS)[number];
export type EvalWeights = Record<TestName, number>;

export const DEFAULT_EVAL_WEIGHTS: EvalWeights = { BBQ: 25, BBG: 25, Safety: 25, Pushback: 25 };

export const TEST_LABELS: Record<TestName, string> = {
  BBQ: "BBQ (multiple choice)",
  BBG: "BBG (stories)",
  Safety: "Safety (WildGuardTest)",
  Pushback: "Pushback",
};

export type EvalDraft = {
  model: string;
  stages: StageId[];
  lite: boolean;
  categories: string[];
  /** Safety: null = every prompt; N = a test sample of N prompts (checks the path cheaply). */
  safetySample: number | null;
  /** Judges ticked in the list, plus any typed under "Other judges". */
  judges: string[];
  extraJudges: string;
  weights: EvalWeights;
};

/** Backend weights are shares summing to 1; the form uses whole percents. */
export function weightsFromBackend(shares: Record<string, number>): EvalWeights {
  const out = { ...DEFAULT_EVAL_WEIGHTS };
  for (const test of TESTS) if (typeof shares[test] === "number") out[test] = Math.round(shares[test] * 100);
  return weightProblems(out).length ? DEFAULT_EVAL_WEIGHTS : out;
}

export function weightsToBackend(weights: EvalWeights): Record<string, number> {
  return Object.fromEntries(TESTS.map((test) => [test, weights[test] / 100]));
}

export const OTHER = "__other__";

/** Every judge chosen: ticked ones first, then typed ones, without repeats. */
export function chosenJudges(draft: EvalDraft): string[] {
  return [...new Set([...draft.judges, ...judgeList(draft.extraJudges)])];
}

export function judgeList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

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

/** Problems the form can see before asking the backend. */
export function formProblems(draft: EvalDraft): string[] {
  const out: string[] = [];
  if (draft.stages.length === 0) out.push("Pick at least one stage.");
  const needsClasses = draft.stages.some((stage) => stage !== "safety");
  if (needsClasses && draft.categories.length === 0) out.push("Pick at least one protected class.");
  if (!/^[\w.-]+\/\S+$/.test(draft.model.trim())) out.push("Model must look like provider/model, e.g. openai/gpt-4o-mini.");
  if (draft.stages.includes("safety") && draft.safetySample !== null && !(draft.safetySample >= 1)) {
    out.push("A safety test sample needs at least 1 prompt.");
  }
  out.push(...weightProblems(draft.weights));
  return out;
}

export type StageSize = { items: number; calls: number; unit: string };

/** What each chosen stage sends, from the backend's item counts: the same numbers the check gives. */
export function stageSizes(draft: EvalDraft, sizes: import("@/lib/backend").Sizes | null): Partial<Record<StageId, StageSize>> {
  if (!sizes) return {};
  const size = draft.lite ? "lite" : "full";
  const sum = (byClass: Record<string, { lite: number; full: number }>) =>
    draft.categories.reduce((total, id) => total + (byClass[id]?.[size] ?? 0), 0);
  const out: Partial<Record<StageId, StageSize>> = {};
  for (const stage of draft.stages) {
    if (stage === "mcq") {
      const n = sum(sizes.mcq);
      out.mcq = { items: n, calls: n, unit: "questions" };
    } else if (stage === "open") {
      const n = sum(sizes.open);
      out.open = { items: n, calls: n, unit: "stories" };
    } else if (stage === "safety") {
      const n = draft.safetySample ?? sizes.safety[size];
      out.safety = { items: Math.min(n, sizes.safety.full), calls: Math.min(n, sizes.safety.full), unit: "prompts" };
    } else {
      const n = sizes.pushback.per_class * draft.categories.length + sizes.pushback.safety;
      out.pushback = { items: n, calls: n * sizes.pushback.turns, unit: "conversations" };
    }
  }
  return out;
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("en-US");
}
