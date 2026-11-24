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

/** What a run covers: the evaluation dataset, the user's saved uploads, or both (scored apart). */
export type DataSource = "dataset" | "uploads" | "both";

export const DATA_SOURCES: Array<{ id: DataSource; title: string; text: string }> = [
  { id: "dataset", title: "Our dataset", text: "The evaluation dataset: protected-class scenarios and WildGuardTest safety prompts." },
  { id: "uploads", title: "Your uploaded prompts", text: "Only prompt sets you upload, in our format." },
  {
    id: "both",
    title: "Both",
    text: "The dataset and your uploads in one run. Each is scored and shown on its own, never mixed.",
  },
];

export const usesDataset = (draft: EvalDraft) => draft.source === "dataset" || draft.source === "both";
export const usesUploads = (draft: EvalDraft) => draft.source === "uploads" || draft.source === "both";

export type EvalDraft = {
  model: string;
  /** null until the user chooses on the Dataset step. */
  source: DataSource | null;
  /** Saved uploads to run (their release ids, upload-<name>). */
  uploads: string[];
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

/** A weight typed as a number: whole percent from 0 to 100; the others are left as they are. */
export function setEvalWeight(current: EvalWeights, key: TestName, value: number): EvalWeights {
  const clean = Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : 0;
  return { ...current, [key]: clean };
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
  if (!draft.source) out.push("Choose what to run on the Dataset step.");
  if (draft.stages.length === 0) out.push("Pick at least one stage.");
  const needsClasses = usesDataset(draft) && draft.stages.some((stage) => stage !== "safety");
  if (needsClasses && draft.categories.length === 0) out.push("Pick at least one protected class.");
  if (usesUploads(draft) && draft.uploads.length === 0) out.push("Pick at least one uploaded prompt set, or run only the dataset.");
  if (!/^[\w.-]+\/\S+$/.test(draft.model.trim())) out.push("Model must look like provider/model, e.g. openai/gpt-4o-mini.");
  if (draft.stages.includes("safety") && draft.safetySample !== null && !(draft.safetySample >= 1)) {
    out.push("A safety test sample needs at least 1 prompt.");
  }
  out.push(...weightProblems(draft.weights));
  return out;
}

export type StageSize = { items: number; calls: number; unit: string };

/** What each chosen stage sends, from the backend's item counts: the same numbers the check gives.
 * Chosen uploads add their own counts (their pushback number is an estimate; the check is exact). */
export function stageSizes(
  draft: EvalDraft,
  sizes: import("@/lib/backend").Sizes | null,
  uploads: import("@/lib/backend").SavedUpload[] = [],
): Partial<Record<StageId, StageSize>> {
  if (!sizes) return {};
  const size = draft.lite ? "lite" : "full";
  const chosen = usesUploads(draft) ? uploads.filter((item) => draft.uploads.includes(item.release)) : [];
  const fromDataset = usesDataset(draft);
  const sum = (byClass: Record<string, { lite: number; full: number }>) =>
    draft.categories.reduce((total, id) => total + (byClass[id]?.[size] ?? 0), 0);
  const out: Partial<Record<StageId, StageSize>> = {};
  const add = (stage: StageId, n: number, perItem: number, unit: string) => {
    const before = out[stage] ?? { items: 0, calls: 0, unit };
    out[stage] = { items: before.items + n, calls: before.calls + n * perItem, unit };
  };
  for (const stage of draft.stages) {
    if (stage === "mcq") {
      if (fromDataset) add("mcq", sum(sizes.mcq), 1, "questions");
      for (const item of chosen) add("mcq", item.counts.mcq[size], 1, "questions");
    } else if (stage === "open") {
      if (fromDataset) add("open", sum(sizes.open), 1, "stories");
      for (const item of chosen) add("open", item.counts.stories[size], 1, "stories");
    } else if (stage === "safety") {
      if (fromDataset) add("safety", Math.min(draft.safetySample ?? sizes.safety[size], sizes.safety.full), 1, "prompts");
      for (const item of chosen) add("safety", item.counts.safety.total, 1, "prompts");
    } else {
      if (fromDataset) {
        add("pushback", sizes.pushback.per_class * draft.categories.length + sizes.pushback.safety, sizes.pushback.turns, "conversations");
      }
      for (const item of chosen) {
        const n = sizes.pushback.per_class * item.counts.classes.length + Math.min(item.counts.safety.harmful, sizes.pushback.safety);
        add("pushback", n, sizes.pushback.turns, "conversations");
      }
    }
  }
  for (const stage of draft.stages) if (out[stage]?.items === 0) delete out[stage];
  return out;
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("en-US");
}
