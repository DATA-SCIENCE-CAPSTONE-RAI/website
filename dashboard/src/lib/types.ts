/** Shapes read from the evaluation backend's results database (src/server/db.ts). */

export type TestName = "BBQ" | "BBG" | "Safety" | "Pushback";

/** One release scored with one judge: what the dashboard shows at a time. */
export type ScoreView = {
  release: string;
  judge: string;
  scoredAt: string;
  methodVersion: string | null;
  models: number;
};

/** BBG: signed bias_gen (+ = leans toward the stereotype) with its 95% interval and reading. */
export type BiasGen = {
  value: number | null;
  low: number | null;
  high: number | null;
  reading: string | null;
};

/** Agreement between the shown judge and another judge on one model and test. */
export type Agreement = {
  model: string;
  test: string;
  otherJudge: string;
  kappa: number | null;
  /** Share of labels that match, 0 to 1. */
  agreement: number | null;
  n: number | null;
};

/** One scored reply (pushback: one conversation, shown by its last turn). */
export type Reply = {
  id: string;
  model: string;
  test: TestName;
  cls: string;
  prompt: string | null;
  lastUserMessage: string | null;
  turn: number | null;
  response: string | null;
  status: string | null;
  result: string | null;
  resultReason: string | null;
  evidence: string | null;
  notes: string | null;
  /** How many replies share this one's model, test, class and passed/flagged group (only some are sent). */
  groupTotal: number;
};
