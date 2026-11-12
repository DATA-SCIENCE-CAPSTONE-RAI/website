"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  backend,
  type BackendStatus,
  type Category,
  type Job,
  type JudgePanel,
  type JudgePlan,
  type ModelCatalog,
  type Sizes,
  type ProviderKey,
  type RunPlan,
} from "@/lib/backend";
import {
  DEFAULT_EVAL_WEIGHTS,
  DEMO_MODEL,
  JUDGED_STAGES,
  OTHER,
  STAGES,
  TEST_LABELS,
  TESTS,
  chosenJudges,
  formProblems,
  formatCount,
  rebalanceEvalWeights,
  stageSizes,
  weightsFromBackend,
  weightsToBackend,
  type EvalDraft,
  type StageId,
  type TestName,
} from "@/lib/evalSetup";

const STEPS = ["Model", "Dataset", "Judges", "Confirm"] as const;

const INITIAL: EvalDraft = {
  model: DEMO_MODEL,
  stages: ["mcq", "open"],
  lite: true,
  categories: [],
  safetySample: null,
  judges: [],
  extraJudges: "",
  weights: DEFAULT_EVAL_WEIGHTS,
};

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm";
const primary = "rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60";
const secondary = "rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink disabled:opacity-60";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function ProblemList({ problems, warnings }: { problems: string[]; warnings?: string[] }) {
  return (
    <>
      {problems.length ? (
        <ul className="mt-3 space-y-1 text-sm text-[#9b2c2c]">
          {problems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {warnings?.length ? (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {warnings.map((item) => (
            <li key={item}>Note: {item}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function JobProgress({ job }: { job: Job }) {
  const share = job.total ? Math.min(1, job.done / job.total) : job.status === "success" ? 1 : 0;
  const what = job.kind === "run" ? "Model run" : job.kind === "judge" ? "Judging" : "Scoring";
  return (
    <div className="mt-4">
      <p className="text-sm text-ink">
        {what}: {job.status === "running" ? `running${job.step ? ` (${job.step})` : ""}` : job.status}
      </p>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#e6edf5]">
        <div
          className={`h-full rounded-full ${job.status === "error" ? "bg-[#D14343]" : "bg-[#3CB371]"}`}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-sm tabular-nums text-ink">
        {formatCount(job.done)} / {formatCount(job.total)} {job.kind === "score" ? "" : "items"}
      </p>
      {Object.keys(job.steps).length > 1 ? (
        <ul className="mt-1 text-sm tabular-nums text-muted">
          {Object.entries(job.steps).map(([step, value]) => (
            <li key={step}>
              {step}: {formatCount(value.done)} / {formatCount(value.total)}
            </li>
          ))}
        </ul>
      ) : null}
      {job.error ? <p className="mt-2 text-sm text-[#9b2c2c]">{job.error}</p> : null}
    </div>
  );
}

/** `readOnly`: a hosted demo (READ_ONLY=1) where every option can be explored, but nothing is
 * checked or run; the lists come from a saved snapshot, so key status does not apply. */
export function EvalWizard({ readOnly = false }: { readOnly?: boolean }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<EvalDraft>(INITIAL);
  const [uploadConfirmed, setUploadConfirmed] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);

  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([]);
  const [panel, setPanel] = useState<JudgePanel | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [sizes, setSizes] = useState<Sizes | null>(null);
  const [typingModel, setTypingModel] = useState(false);

  const [plan, setPlan] = useState<RunPlan | null>(null);
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [judgePlan, setJudgePlan] = useState<JudgePlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [lastRun, setLastRun] = useState<Job | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const usable = (item: { ready: boolean }) => readOnly || item.ready;

  const load = useCallback(async () => {
    try {
      const current = await backend.status();
      const [cats, keyRows, judges, weights, models] = await Promise.all([
        backend.categories(),
        backend.keys(),
        backend.judges().catch(() => null),
        backend.weights(),
        backend.models().catch(() => null),
      ]);
      backend.sizes().then(setSizes).catch(() => setSizes(null));   // sizes are a convenience: never block on them
      // "connected" only once every list is in, so the form never shows half-loaded choices
      setStatus(current);
      setOffline(null);
      setCategories(cats);
      setProviderKeys(keyRows);
      setPanel(judges);
      setCatalog(models);
      const realModels = (models?.models ?? []).filter((item) => !item.demo);
      setDraft((value) => ({
        ...value,
        // a demo site cannot run, so the free mock model has nothing to show: start on a real model
        model:
          readOnly && value.model.startsWith("demo/") && realModels.length
            ? (realModels.find((item) => item.default) ?? realModels[0]).id
            : value.model,
        categories: value.categories.length ? value.categories : cats.map((item) => item.id),
        // default panel judges that have a key; the user can tick demo judges for a free run
        judges: value.judges.length
          ? value.judges
          : (models?.judges ?? []).filter((item) => item.default && usable(item)).map((item) => item.id),
        weights: weightsFromBackend(weights),
      }));
      if (current.active_job) setJob(current.active_job);
    } catch (error) {
      setOffline(errorText(error));
    }
  }, [readOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  // Follow a running job about once a second.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    timer.current = setInterval(async () => {
      try {
        const next = await backend.job(job.id);
        setJob(next);
        if (next.status !== "running" && next.kind === "run") setLastRun(next);
      } catch (error) {
        setActionError(errorText(error));
      }
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [job]);

  const draftKey = JSON.stringify(draft);
  const blocking = useMemo(() => formProblems(draft), [draft]);
  const planIsCurrent = plan !== null && planFor === draftKey;
  const running = job?.status === "running";
  const readyProviders = providerKeys.filter((row) => row.ready).map((row) => row.provider);
  const judgeStages = JUDGED_STAGES.filter((stage) => (lastRun?.request.stages as string[] | undefined)?.includes(stage));

  function update(change: Partial<EvalDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  function toggle<T extends string>(list: T[], id: T): T[] {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  function runBody() {
    return {
      model: draft.model.trim(),
      stages: draft.stages,
      lite: draft.lite,
      categories: draft.categories.length === categories.length ? [] : draft.categories,
      weights: weightsToBackend(draft.weights),
      safety_sample: draft.stages.includes("safety") ? draft.safetySample : null,
    };
  }

  async function act(label: string, action: () => Promise<void>) {
    setBusy(label);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  const checkRun = () =>
    act("Checking", async () => {
      setPlan(await backend.planRun(runBody()));
      setPlanFor(draftKey);
    });

  const startRun = () =>
    act("Starting", async () => {
      const started = await backend.startRun(runBody());
      setJob(started);
      setPlan(null);
      setJudgePlan(null);
    });

  const sizesNow = stageSizes(draft, sizes);
  const totalCalls = Object.values(sizesNow).reduce((total, size) => total + (size?.calls ?? 0), 0);
  const judges = chosenJudges(draft);
  const paidJudges = judges.filter((name) => !name.startsWith("demo/"));
  const judgeBody = () => ({ stages: judgeStages, judges });

  const checkJudges = () => act("Checking judges", async () => setJudgePlan(await backend.planJudge(judgeBody())));

  const startJudges = () =>
    act("Starting judges", async () => {
      setJob(await backend.startJudge(judgeBody()));
      setJudgePlan(null);
    });

  const startScore = () => act("Scoring", async () => setJob(await backend.startScore()));

  return (
    <div className="mx-auto min-w-0 max-w-7xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Evaluation setup</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          {readOnly
            ? "Model, dataset and judges: the choices a run is set up with. Results appear on the Scores page."
            : "Model, dataset and judges, then a check of what the run would send and cost. The run, judging and scoring happen in the evaluation backend on this machine; results appear on the Scores page."}
        </p>
      </header>

      {readOnly ? (
        <section className="mt-6 rounded-2xl border border-[#ecd9a7] bg-[#fdf8ea] p-5 text-sm text-ink">
          <p className="font-medium">Demo: explore every option; running is turned off.</p>
          <p className="mt-1 text-muted">
            This site has no evaluation backend, so checks, cost estimates and runs are not available. To run an
            evaluation, install the evaluation backend on your own machine with your own API keys.
          </p>
        </section>
      ) : null}

      {offline ? (
        <section className="mt-6 rounded-2xl border border-[#e7c2c2] bg-[#fdf3f3] p-5 text-sm text-ink">
          <p className="font-medium">The evaluation backend is not connected.</p>
          <p className="mt-1">{offline}</p>
          <button type="button" className={`${secondary} mt-3`} onClick={() => void load()}>
            Try again
          </button>
        </section>
      ) : readOnly ? null : status ? (
        <p className="mt-3 text-sm text-muted">
          Backend connected · release {status.release}
          {status.db_exists ? "" : " · no results yet"}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">Connecting to the evaluation backend…</p>
      )}

      <ol className="mt-6 flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              className={
                step === index
                  ? "rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink"
              }
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className={`mt-6 ${card}`}>
          <h2 className="text-lg font-semibold text-ink">Model</h2>
          {readOnly ? null : (
              <p className="mt-1 text-sm text-muted">
                Use <span className="font-medium text-ink">{DEMO_MODEL}</span> to try a run with no API key and no cost (mock
                answers that mean nothing).
              </p>
          )}
          <label className="mt-4 block text-sm font-medium text-ink" htmlFor="eval-model">
            Model
          </label>
          <select
            id="eval-model"
            value={typingModel || !catalog?.models.some((item) => item.id === draft.model) ? OTHER : draft.model}
            onChange={(event) => {
              const value = event.target.value;
              setTypingModel(value === OTHER);
              if (value !== OTHER) update({ model: value });
            }}
            className="mt-2 w-full max-w-md rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            {readOnly ? null : (
              <optgroup label="Free demo (no key, no cost)">
                {(catalog?.models ?? []).filter((item) => item.demo).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} (mock answers)
                  </option>
                ))}
              </optgroup>
            )}
            {(catalog?.providers ?? []).map((provider) => {
              const models = (catalog?.models ?? []).filter((item) => !item.demo && item.provider === provider.provider);
              if (!models.length) return null;
              return (
                <optgroup key={provider.provider} label={`${provider.label}${usable(provider) ? "" : " (no key)"}`}>
                  {models.map((item) => (
                    <option key={item.id} value={item.id} disabled={!usable(item)}>
                      {item.id}
                    </option>
                  ))}
                </optgroup>
              );
            })}
            <option value={OTHER}>Other model… (type it)</option>
          </select>
          {typingModel || !catalog?.models.some((item) => item.id === draft.model) ? (
            <input
              aria-label="Model name"
              value={draft.model}
              onChange={(event) => update({ model: event.target.value })}
              className="mt-2 w-full max-w-md rounded-lg border border-line px-3 py-2 text-sm text-ink"
              placeholder="provider/model"
            />
          ) : null}
          {!readOnly && !draft.model.startsWith("demo/") ? (
            <p className="mt-2 text-sm text-muted">This model is called with the backend&apos;s API key, and calls are billed.</p>
          ) : null}
          {!readOnly && providerKeys.length ? (
            <div className="mt-4 text-sm">
              <p className="font-medium text-ink">Providers with a key on the backend machine</p>
              <p className="mt-1 text-muted">
                {readyProviders.length ? readyProviders.join(", ") : "None yet. Add keys to the backend's .env file."}
              </p>
              <p className="mt-1 text-muted">
                Examples:{" "}
                {providerKeys
                  .filter((row) => row.ready)
                  .map((row) => row.example)
                  .join(", ") || "—"}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="mt-6 space-y-6">
          <div className={card}>
            <h2 className="text-lg font-semibold text-ink">Dataset</h2>
            <p className="mt-1 text-sm text-muted">Choose the tests, how much of the data, and the protected classes.</p>

            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-ink">1. Tests</legend>
              <div className="mt-2 space-y-2">
                {STAGES.map((stage) => {
                  const chosen = draft.stages.includes(stage.id);
                  const size = sizesNow[stage.id];
                  return (
                    <div key={stage.id} className={`rounded-xl border p-3 ${chosen ? "border-ink/40 bg-[#f7f9fc]" : "border-line"}`}>
                      <label className="flex items-start gap-3 text-sm text-ink">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-ink"
                          checked={chosen}
                          onChange={() => update({ stages: toggle<StageId>(draft.stages, stage.id) })}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="font-medium">{stage.label}</span>
                            {size ? (
                              <span className="tabular-nums text-muted" data-testid={`size-${stage.id}`}>
                                {formatCount(size.items)} {size.unit}
                                {size.calls !== size.items ? ` · ${formatCount(size.calls)} calls` : ""}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-muted">{stage.about}</span>
                        </span>
                      </label>
                      {stage.id === "safety" && chosen ? (
                        <div className="ml-7 mt-3 border-t border-line pt-3">
                          <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-ink"
                              checked={draft.safetySample !== null}
                              onChange={(event) => update({ safetySample: event.target.checked ? 50 : null })}
                            />
                            Only a small test sample of
                            <input
                              type="number"
                              min={1}
                              aria-label="Safety sample size"
                              disabled={draft.safetySample === null}
                              value={draft.safetySample ?? 50}
                              onChange={(event) => update({ safetySample: Number(event.target.value) })}
                              className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink disabled:opacity-50"
                            />
                            prompts
                          </label>
                          <p className="mt-1 text-sm text-muted">
                            For checking that the safety test works before paying for it. Marked &ldquo;not a full
                            result&rdquo; in the scores; a lite or full safety run always replaces it.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-ink">2. How much of the data</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  {
                    lite: true,
                    title: "Lite: a quarter",
                    text: `1 of the 4 name pairs per template, and ${sizes ? formatCount(sizes.safety.lite) : "a quarter of the"} safety prompts (every kind kept). For trying models and comparing them at lower cost.`,
                  },
                  {
                    lite: false,
                    title: "Full: everything",
                    text: `All 4 name pairs per template and all ${sizes ? formatCount(sizes.safety.full) : ""} safety prompts. For the results you report.`,
                  },
                ].map((option) => (
                  <label
                    key={option.title}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
                      draft.lite === option.lite ? "border-ink/40 bg-[#f7f9fc]" : "border-line"
                    }`}
                  >
                    <input
                      type="radio"
                      name="data-size"
                      className="mt-0.5 h-4 w-4 accent-ink"
                      checked={draft.lite === option.lite}
                      onChange={() => update({ lite: option.lite })}
                    />
                    <span>
                      <span className="font-medium text-ink">{option.title}</span>
                      <span className="mt-0.5 block text-muted">{option.text}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-sm text-muted">
                Pushback is always its fixed set of conversations. In the scores, a full run always counts over a lite
                one.
              </p>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-ink">3. Protected classes</legend>
              <p className="mt-1 text-sm text-muted">
                For multiple choice, stories and pushback. Safety prompts are not split by class.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink"
                  onClick={() => update({ categories: categories.map((item) => item.id) })}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink"
                  onClick={() => update({ categories: [] })}
                >
                  Clear
                </button>
                <span className="text-sm text-muted">
                  {draft.categories.length} of {categories.length} selected
                </span>
              </div>
              {categories.length ? (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {categories.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-ink"
                        checked={draft.categories.includes(item.id)}
                        onChange={() => update({ categories: toggle(draft.categories, item.id) })}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">The class list comes from the backend&apos;s dataset release.</p>
              )}
            </fieldset>

            {Object.keys(sizesNow).length ? (
              <p className="mt-6 rounded-xl bg-[#f7f9fc] px-4 py-3 text-sm text-ink" data-testid="size-total">
                This run: <span className="font-medium tabular-nums">{formatCount(totalCalls)} model calls</span>
                {draft.model.startsWith("demo/") ? " (free with the demo model)" : ""}. The exact estimate with tokens
                comes from &ldquo;Check and estimate&rdquo; on the Confirm step.
              </p>
            ) : null}
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-ink">Do not include personal or confidential data in your prompts.</h2>
            <p className="mt-2 text-sm text-muted">
              Prompts are sent to the model provider you choose, may be kept in their logs, and are stored in this
              tool&apos;s results and exports. Before uploading, remove names, addresses, phone numbers, email
              addresses, dates of birth, government ID numbers, health or financial information about real people, and
              anything marked confidential.
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-ink"
                checked={uploadConfirmed}
                onChange={(event) => setUploadConfirmed(event.target.checked)}
              />
              I confirm these prompts contain no personal or confidential data.
            </label>
            <label className="mt-4 block text-sm font-medium text-ink" htmlFor="prompt-upload">
              Upload prompts (CSV or JSONL)
            </label>
            <input
              id="prompt-upload"
              type="file"
              accept=".csv,.jsonl,text/csv,application/jsonl"
              disabled={!uploadConfirmed}
              onChange={(event) => setUploadName(event.target.files?.[0]?.name ?? null)}
              className="mt-2 block text-sm text-ink file:mr-3 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm disabled:opacity-50"
            />
            <p className="mt-2 text-sm text-muted">
              {uploadName ? `Selected ${uploadName}. ` : ""}
              Running uploaded prompts depends on the link-prompts feature, which is not built yet.
            </p>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={`mt-6 ${card}`}>
          <h2 className="text-lg font-semibold text-ink">Judges</h2>
          <p className="mt-1 text-sm text-muted">
            One model per line, as provider/model. Judges label stories, safety replies and pushback turns after the
            model run; multiple choice is read without a judge. Each judge is scored on its own and never merged, and
            agreement between judges is reported.{readOnly ? "" : " Demo judges are free mocks for trying the flow."}
          </p>
          <fieldset className="mt-4 space-y-2">
            <legend className="text-sm font-medium text-ink">Judge models</legend>
            {(catalog?.judges ?? []).filter((item) => !(readOnly && item.demo)).map((item) => (
              <label key={item.id} className={`flex items-center gap-2 text-sm ${usable(item) ? "text-ink" : "text-muted"}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-ink"
                  disabled={!usable(item)}
                  checked={draft.judges.includes(item.id)}
                  onChange={() => update({ judges: toggle(draft.judges, item.id) })}
                />
                {item.id}
                {item.demo ? " (free mock)" : ""}
                {item.default ? " · default" : ""}
                {usable(item) ? "" : " · no key"}
              </label>
            ))}
          </fieldset>
          <label className="mt-4 block text-sm font-medium text-ink" htmlFor="eval-judges">
            Other judges (one per line, provider/model)
          </label>
          <textarea
            id="eval-judges"
            value={draft.extraJudges}
            onChange={(event) => update({ extraJudges: event.target.value })}
            rows={2}
            placeholder="provider/model"
            className="mt-2 w-full max-w-md rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
          <p className="mt-2 text-sm text-muted">
            {judges.length ? `Chosen: ${judges.join(", ")}.` : "Pick at least one judge to label the replies."}
            {paidJudges.length ? " Real judges are billed to the backend's API keys." : ""}
          </p>
          {panel ? (
            <p className="mt-2 text-sm text-muted">
              Default panel (config/judges.yaml): {panel.panel.join(", ") || "—"}
              {panel.no_credentials.length ? ` · no key for ${panel.no_credentials.join(", ")}` : ""} · prompt{" "}
              {panel.prompt_version}
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-6 space-y-6">
          <div className={card}>
            <h2 className="text-lg font-semibold text-ink">Weights</h2>
            <p className="mt-1 text-sm text-muted">
              Moving one scale changes the others so the four weights still sum to 100%. The weights are saved with the
              run; the scores still use the evaluation team&apos;s weights in the backend&apos;s config/scoring.yaml.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TESTS.map((test) => (
                <label key={test} className="block" htmlFor={`eval-weight-${test}`}>
                  <span className="flex items-center justify-between gap-2 text-sm font-medium text-ink">
                    <span>{TEST_LABELS[test]}</span>
                    <span className="tabular-nums">{draft.weights[test]}%</span>
                  </span>
                  <input
                    id={`eval-weight-${test}`}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={draft.weights[test]}
                    onChange={(event) =>
                      update({ weights: rebalanceEvalWeights(draft.weights, test as TestName, Number(event.target.value)) })
                    }
                    className="mt-2 w-full accent-ink"
                  />
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm font-medium text-ink">
              Total {TESTS.reduce((sum, test) => sum + draft.weights[test], 0)}%
            </p>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-ink">Confirm</h2>
            <p className="mt-1 text-sm text-ink">
              {draft.model.trim() || "No model"} · {draft.lite ? "lite (a quarter of the data)" : "full data"} ·{" "}
              {draft.categories.length} of{" "}
              {categories.length} classes
              {draft.stages.includes("safety") && draft.safetySample !== null ? ` · safety test sample of ${draft.safetySample}` : ""}
            </p>
            <ProblemList problems={blocking} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={secondary}
                disabled={readOnly || blocking.length > 0 || Boolean(offline) || busy !== null}
                onClick={checkRun}
              >
                {busy === "Checking" ? "Checking… (a few seconds)" : "Check and estimate"}
              </button>
              <button
                type="button"
                className={primary}
                disabled={readOnly || !planIsCurrent || !plan?.ready || running || busy !== null}
                onClick={startRun}
              >
                {busy === "Starting" ? "Starting…" : "Start run"}
              </button>
            </div>
            {readOnly ? (
              <p className="mt-3 text-sm text-muted">Checking and running are turned off on this demo site.</p>
            ) : null}
            {plan && !planIsCurrent ? (
              <p className="mt-3 text-sm text-muted">The setup changed since the check. Check again before starting.</p>
            ) : null}
            {plan && planIsCurrent ? (
              <div className="mt-4">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 font-medium">Stage</th>
                      <th className="py-1 font-medium">Items</th>
                      <th className="py-1 font-medium">Calls</th>
                      <th className="py-1 font-medium">Input tokens (est.)</th>
                      <th className="py-1 font-medium">Output tokens (max)</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-ink">
                    {Object.entries(plan.stages).map(([stage, value]) => (
                      <tr key={stage} className="border-t border-line">
                        <td className="py-1">{STAGES.find((item) => item.id === stage)?.label ?? stage}</td>
                        <td className="py-1">{formatCount(value.items)}</td>
                        <td className="py-1">{formatCount(value.calls)}</td>
                        <td className="py-1">{formatCount(value.input_tokens)}</td>
                        <td className="py-1">
                          {formatCount(value.max_output_tokens)}
                          {value.expected_output_tokens !== null
                            ? ` (about ${formatCount(value.expected_output_tokens)})`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-sm text-muted">
                  Starting sends these calls to the provider and is billed to the backend&apos;s API key. Multiply the
                  tokens by the provider&apos;s prices for the cost.
                </p>
                <ProblemList problems={plan.problems} warnings={plan.warnings} />
                {plan.ready ? <p className="mt-3 text-sm text-ink">Ready to start.</p> : null}
              </div>
            ) : null}
          </div>

          {readOnly ? null : (
          <div className={card}>
            <h2 className="text-lg font-semibold text-ink">Progress</h2>
            {job ? (
              <JobProgress job={job} />
            ) : (
              <p className="mt-1 text-sm text-muted">Start a run to follow it here. The bar fills as each item finishes.</p>
            )}
            {actionError ? <p className="mt-3 text-sm text-[#9b2c2c]">{actionError}</p> : null}

            {lastRun && !running ? (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-base font-semibold text-ink">Next steps</h3>
                {judgeStages.length ? (
                  <>
                    <p className="mt-1 text-sm text-muted">
                      1. Judges label the {judgeStages.join(", ")} replies (paid calls, unless the judges are demo/…).
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={secondary} disabled={busy !== null || judges.length === 0} onClick={checkJudges}>
                        Check judging
                      </button>
                      <button
                        type="button"
                        className={primary}
                        disabled={!judgePlan?.ready || busy !== null}
                        onClick={startJudges}
                      >
                        Start judging
                      </button>
                    </div>
                    {judgePlan ? (
                      <div className="mt-2 text-sm text-ink">
                        <ul className="tabular-nums">
                          {Object.entries(judgePlan.judges).map(([name, byStage]) => (
                            <li key={name}>
                              {name}:{" "}
                              {Object.entries(byStage)
                                .map(
                                  ([stage, value]) =>
                                    `${stage} ${formatCount(value.replies)} replies, ~${formatCount(value.input_tokens)} input tokens`,
                                )
                                .join(" · ")}
                            </li>
                          ))}
                        </ul>
                        <ProblemList problems={judgePlan.problems} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">Multiple choice needs no judge.</p>
                )}
                <p className="mt-3 text-sm text-muted">{judgeStages.length ? "2" : "1"}. Score the results (free).</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button type="button" className={secondary} disabled={busy !== null} onClick={startScore}>
                    Score
                  </button>
                  {job?.kind === "score" && job.status === "success" ? (
                    <Link href="/" className="text-sm font-medium text-ink underline underline-offset-4">
                      Open the Scores page
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          )}
        </section>
      ) : null}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          className={secondary}
        >
          Back
        </button>
        <button
          type="button"
          disabled={step === STEPS.length - 1}
          onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
          className={primary}
        >
          Next
        </button>
      </div>
    </div>
  );
}
