"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_EVAL_WEIGHTS,
  DEMO_MODEL,
  NY_CLASSES,
  STAGES,
  TEST_LABELS,
  TESTS,
  plan,
  planTotal,
  problems,
  rebalanceEvalWeights,
  warnings,
  type EvalDraft,
  type StageId,
  type TestName,
} from "@/lib/evalSetup";

const STEPS = ["Model", "Dataset", "Judges", "Confirm"] as const;

const INITIAL: EvalDraft = {
  model: DEMO_MODEL,
  stages: ["mcq", "open"],
  lite: true,
  categories: NY_CLASSES.map((item) => item.id),
  judges: "",
  weights: DEFAULT_EVAL_WEIGHTS,
};

export function EvalWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<EvalDraft>(INITIAL);
  const [uploadConfirmed, setUploadConfirmed] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const blocking = useMemo(() => problems(draft), [draft]);
  const notes = useMemo(() => warnings(draft), [draft]);
  const counts = useMemo(() => plan(draft), [draft]);
  const total = planTotal(counts);

  function toggleStage(id: StageId) {
    setStarted(false);
    setDraft((current) => ({
      ...current,
      stages: current.stages.includes(id) ? current.stages.filter((item) => item !== id) : [...current.stages, id],
    }));
  }

  function toggleCategory(id: string) {
    setStarted(false);
    setDraft((current) => ({
      ...current,
      categories: current.categories.includes(id)
        ? current.categories.filter((item) => item !== id)
        : [...current.categories, id],
    }));
  }

  return (
    <div className="mx-auto min-w-0 max-w-7xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Evaluation setup</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          The same steps the evaluation backend expects: model, dataset, judges, then a check before the run. Scores
          for a finished run stay on the Scores page.
        </p>
      </header>

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
        <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Model</h2>
          <p className="mt-1 text-sm text-muted">
            Use <span className="font-medium text-ink">demo/random</span> to preview a run with no API key. It is
            recorded as mockllm/model.
          </p>
          <label className="mt-4 block text-sm font-medium text-ink" htmlFor="eval-model">
            Model
          </label>
          <input
            id="eval-model"
            value={draft.model}
            onChange={(event) => {
              setStarted(false);
              setDraft((current) => ({ ...current, model: event.target.value }));
            }}
            className="mt-2 w-full max-w-md rounded-lg border border-line px-3 py-2 text-sm text-ink"
            placeholder="provider/model"
          />
        </section>
      ) : null}

      {step === 1 ? (
        <section className="mt-6 space-y-6">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Dataset</h2>
            <p className="mt-1 text-sm text-muted">Lite uses one name-pair per template. Leave every class selected to run all of them.</p>
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Stages</legend>
              {STAGES.map((stage) => (
                <label key={stage.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-ink"
                    checked={draft.stages.includes(stage.id)}
                    onChange={() => toggleStage(stage.id)}
                  />
                  {stage.label}
                </label>
              ))}
            </fieldset>
            <label className="mt-4 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink"
                checked={draft.lite}
                onChange={(event) => {
                  setStarted(false);
                  setDraft((current) => ({ ...current, lite: event.target.checked }));
                }}
              />
              Lite subset
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink"
                onClick={() => setDraft((current) => ({ ...current, categories: NY_CLASSES.map((item) => item.id) }))}
              >
                Select all
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink"
                onClick={() => setDraft((current) => ({ ...current, categories: [] }))}
              >
                Clear
              </button>
            </div>
            <fieldset className="mt-2">
              <legend className="sr-only">Protected classes</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {NY_CLASSES.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-ink"
                      checked={draft.categories.includes(item.id)}
                      onChange={() => toggleCategory(item.id)}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
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
        <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Judges</h2>
          <p className="mt-1 text-sm text-muted">
            One model per line, as provider/model. This choice is kept with the setup. Judging runs after the model
            replies, and agreement between judges is written when more than one judge labels the same reply.
          </p>
          <label className="mt-4 block text-sm font-medium text-ink" htmlFor="eval-judges">
            Judge models
          </label>
          <textarea
            id="eval-judges"
            value={draft.judges}
            onChange={(event) => setDraft((current) => ({ ...current, judges: event.target.value }))}
            rows={4}
            placeholder="google/gemini-2.5-flash"
            className="mt-2 w-full max-w-md rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-6 space-y-6">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Weights</h2>
            <p className="mt-1 text-sm text-muted">
              Each test starts at 25%. Moving one scale changes the others so the four weights still sum to 100%. A
              test with no results is left out and the rest are scaled again when the score is computed.
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
                    onChange={(event) => {
                      setStarted(false);
                      setDraft((current) => ({
                        ...current,
                        weights: rebalanceEvalWeights(current.weights, test as TestName, Number(event.target.value)),
                      }));
                    }}
                    className="mt-2 w-full accent-ink"
                  />
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm font-medium text-ink">
              Total {TESTS.reduce((sum, test) => sum + draft.weights[test], 0)}%
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Confirm</h2>
            <p className="mt-1 text-sm text-ink">
              {draft.model.trim() || "No model"} · {draft.lite ? "lite" : "full split"} ·{" "}
              {draft.categories.length} classes
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              {STAGES.filter((stage) => draft.stages.includes(stage.id)).map((stage) => (
                <div key={stage.id} className="flex items-center justify-between gap-3">
                  <dt className="text-muted">{stage.label}</dt>
                  <dd className="font-medium tabular-nums text-ink">
                    {counts[stage.id] === null ? "Counted on the eval machine" : `${counts[stage.id]} items`}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
                <dt className="text-muted">Total</dt>
                <dd className="font-medium tabular-nums text-ink">{total === null ? "—" : `${total} items`}</dd>
              </div>
            </dl>
            {blocking.length > 0 ? (
              <ul className="mt-4 space-y-1 text-sm text-[#9b2c2c]">
                {blocking.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-ink">Ready to start. No blocking problems in this check.</p>
            )}
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button
              type="button"
              disabled={blocking.length > 0}
              onClick={() => setStarted(true)}
              className="mt-5 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Start run
            </button>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Progress</h2>
            <p className="mt-1 text-sm text-muted">
              {started
                ? "The evaluation package is not installed on this machine, so Inspect has not started. The bar shows the planned size of this run."
                : "Start a run to see its size here. A live run would fill this bar as each item finishes."}
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#e6edf5]">
              <div className="h-full w-0 rounded-full bg-[#3CB371]" />
            </div>
            <p className="mt-2 text-sm tabular-nums text-ink">
              0 / {total ?? "—"}
              {started ? " · not started" : ""}
            </p>
          </div>
        </section>
      ) : null}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink disabled:opacity-60"
        >
          Back
        </button>
        <button
          type="button"
          disabled={step === STEPS.length - 1}
          onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
          className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Next
        </button>
      </div>
    </div>
  );
}
