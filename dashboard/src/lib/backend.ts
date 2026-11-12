/**
 * Calls to the evaluation backend's local API (`raieval serve`), through this site's
 * /api/backend proxy. Shapes follow docs/api.md in the backend repo.
 */

export type BackendStatus = {
  release: string;
  stages: Record<string, string>;
  db_exists: boolean;
  schema_version: string | null;
  expected_schema_version: string;
  active_job: Job | null;
};

export type Category = { id: string; label: string; [key: string]: unknown };

/** Item counts per stage, from GET /api/sizes (instant; for showing sizes while choosing). */
export type Sizes = {
  mcq: Record<string, { lite: number; full: number }>;
  open: Record<string, { lite: number; full: number }>;
  safety: { lite: number; full: number };
  pushback: { per_class: number; safety: number; turns: number };
};

export type ProviderKey = {
  provider: string;
  label: string;
  ready: boolean;
  vars: string[];
  missing: string[];
  example: string;
  note: string;
};

export type JudgePanel = {
  panel: string[];
  one_judge: string | null;
  ready: string[];
  no_credentials: string[];
  prompt_version: string;
  stages: string[];
};

export type CatalogEntry = { id: string; provider: string; ready: boolean; demo: boolean; default?: boolean };

export type ModelCatalog = {
  providers: Array<{ provider: string; label: string; ready: boolean; example: string }>;
  models: CatalogEntry[];
  judges: CatalogEntry[];
};

export type Check = { name: string; level: "ok" | "warn" | "fail"; detail: string };

export type StagePlan = {
  items: number;
  calls: number;
  calls_per_item: number;
  input_tokens: number;
  max_output_tokens: number;
  expected_output_tokens: number | null;
  checks: Check[];
};

export type RunPlan = { ready: boolean; problems: string[]; warnings: string[]; stages: Record<string, StagePlan> };

export type JudgePlan = {
  ready: boolean;
  problems: string[];
  calls: number;
  prompt_version: string;
  judges: Record<string, Record<string, { replies: number; input_tokens: number; max_output_tokens: number }>>;
};

export type Job = {
  id: string;
  kind: "run" | "judge" | "score";
  status: "running" | "success" | "error";
  error: string | null;
  step: string | null;
  done: number;
  total: number;
  steps: Record<string, { done: number; total: number }>;
  request: Record<string, unknown>;
  run_ids: string[];
  started: string;
  finished: string | null;
};

export type RunBody = {
  model: string;
  stages: string[];
  lite: boolean;
  categories: string[];
  weights: Record<string, number>;
  /** Safety: a seeded test sample of N prompts instead of all of them (not a full result). */
  safety_sample?: number | null;
  release?: string | null;
};

export type JudgeBody = { stages: string[]; judges: string[] | null; release?: string | null };

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data.detail === "string" ? data.detail : `Backend error ${response.status}`;
    throw new BackendError(detail, response.status);
  }
  return data as T;
}

export const backend = {
  status: () => call<BackendStatus>("status"),
  categories: (release?: string) =>
    call<Category[]>(`categories${release ? `?release=${encodeURIComponent(release)}` : ""}`),
  keys: () => call<ProviderKey[]>("keys"),
  sizes: () => call<Sizes>("sizes"),
  judges: () => call<JudgePanel>("judges"),
  weights: () => call<Record<string, number>>("weights"),
  models: () => call<ModelCatalog>("models"),
  planRun: (body: RunBody) => call<RunPlan>("runs/plan", body),
  startRun: (body: RunBody) => call<Job>("runs", { ...body, confirm: true }),
  planJudge: (body: JudgeBody) => call<JudgePlan>("judge/plan", body),
  startJudge: (body: JudgeBody) => call<Job>("judge", { ...body, confirm: true }),
  startScore: (release?: string | null) => call<Job>("score", { release: release ?? null }),
  job: (id: string) => call<Job>(`jobs/${encodeURIComponent(id)}`),
  activeJob: () => call<Job | null>("jobs/active"),
};
