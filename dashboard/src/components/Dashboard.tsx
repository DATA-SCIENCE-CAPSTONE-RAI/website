"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BenchmarkChart } from "@/components/BenchmarkChart";
import { ClassFilter } from "@/components/ClassFilter";
import { ModelCard } from "@/components/ModelCard";
import { PromptInspector } from "@/components/PromptInspector";
import { ScoreGauge } from "@/components/ScoreGauge";
import { promptsForAxis, type BenchmarkName } from "@/lib/examples";
import { downloadRunPdf } from "@/lib/pdf";
import {
  EVEN_WEIGHTS,
  formatScore,
  rebalanceWeights,
  reportChartRows,
  withBbqClasses,
  type BenchmarkWeights,
  type ModelSummary,
} from "@/lib/score";
import type { DerivedReply, EvaluationRun } from "@/lib/types";

type DashboardProps = {
  run: EvaluationRun;
  runs: EvaluationRun[];
  summaries: ModelSummary[];
  replies: DerivedReply[];
  githubUrl: string;
  docsUrl: string;
};

function bbqLabels(summaries: ModelSummary[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const summary of summaries) {
    for (const point of summary.bbqByClass) {
      if (seen.has(point.label)) continue;
      seen.add(point.label);
      labels.push(point.label);
    }
  }
  return labels;
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const names = new Set(left);
  return right.every((label) => names.has(label));
}

function sameWeights(left: BenchmarkWeights, right: BenchmarkWeights): boolean {
  return left.bbq === right.bbq && left.bbg === right.bbg && left.sycon === right.sycon && left.wildguard === right.wildguard;
}

function classSelectionStatus(
  full: ModelSummary | null,
  shown: ModelSummary | null,
  labels: string[],
  appliedHere: string[],
  pending: boolean,
): string {
  const pendingNote = pending ? " Configuration changed. Recalculate to update the score." : "";
  const scoreNote =
    formatScore(full?.composite ?? null) === formatScore(shown?.composite ?? null)
      ? ""
      : ` Overall ${formatScore(full?.composite ?? null)} → ${formatScore(shown?.composite ?? null)}.`;
  if (appliedHere.length === labels.length) {
    return `All ${labels.length} BBQ classes are included.${scoreNote}${pendingNote}`;
  }
  if (appliedHere.length === 0) {
    return `No BBQ classes are included, so the overall score uses the other tests only.${pendingNote}`;
  }
  return `BBQ uses ${appliedHere.length} of ${labels.length} classes. Overall ${formatScore(full?.composite ?? null)} → ${formatScore(shown?.composite ?? null)}.${pendingNote}`;
}

function openingAxis(summaries: ModelSummary[], replies: DerivedReply[]): { benchmark: BenchmarkName; axis: string } {
  const model = summaries[0]?.model;
  const sample = replies.find((row) => row.model === model && row.test === "BBQ" && row.cls);
  if (sample?.cls) return { benchmark: "BBQ", axis: sample.cls };
  const bbq = summaries[0]?.bbqByClass[0];
  if (bbq) return { benchmark: "BBQ", axis: bbq.label };
  const bbg = summaries[0]?.bbgByClass[0];
  if (bbg) return { benchmark: "BBG", axis: bbg.label };
  return { benchmark: "BBQ", axis: "" };
}

export function Dashboard({ run, runs, summaries, replies, githubUrl, docsUrl }: DashboardProps) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(summaries[0]?.model ?? "");
  const [openAxis, setOpenAxis] = useState<{ benchmark: BenchmarkName; axis: string }>(() =>
    openingAxis(summaries, replies),
  );
  const [draftClasses, setDraftClasses] = useState<string[]>(() => bbqLabels(summaries));
  const [appliedClasses, setAppliedClasses] = useState<string[]>(() => bbqLabels(summaries));
  const [draftWeights, setDraftWeights] = useState<BenchmarkWeights>(EVEN_WEIGHTS);
  const [appliedWeights, setAppliedWeights] = useState<BenchmarkWeights>(EVEN_WEIGHTS);

  useEffect(() => {
    if (!summaries.some((summary) => summary.model === selectedModel)) {
      setSelectedModel(summaries[0]?.model ?? "");
    }
  }, [summaries, selectedModel, run.id]);

  const [classRunId, setClassRunId] = useState(run.id);
  if (classRunId !== run.id) {
    const labels = bbqLabels(summaries);
    setClassRunId(run.id);
    setDraftClasses(labels);
    setAppliedClasses(labels);
    setDraftWeights(EVEN_WEIGHTS);
    setAppliedWeights(EVEN_WEIGHTS);
  }

  const applied = new Set(appliedClasses);
  const draft = new Set(draftClasses);
  const configured = summaries.map((summary) => withBbqClasses(summary, applied, appliedWeights));
  const selectedSummary = configured.find((summary) => summary.model === selectedModel) ?? null;
  const selectedFull = summaries.find((summary) => summary.model === selectedModel) ?? null;
  const classLabels = selectedFull?.bbqByClass.map((point) => point.label) ?? [];
  const bbq = reportChartRows(configured, selectedModel, (summary) => summary.bbqByClass);
  const bbg = reportChartRows(summaries, selectedModel, (summary) => summary.bbgByClass);
  const wildguard = reportChartRows(summaries, selectedModel, (summary) => summary.wgBySheet);
  const sycon = reportChartRows(summaries, selectedModel, (summary) => summary.syconByTurn);
  const visibleBbq = selectedSummary?.bbqByClass.map((point) => point.label) ?? [];
  if (openAxis.benchmark === "BBQ" && visibleBbq.length > 0 && !visibleBbq.includes(openAxis.axis)) {
    const sample = replies.find(
      (row) => row.model === selectedModel && row.test === "BBQ" && row.cls && visibleBbq.includes(row.cls),
    );
    setOpenAxis({ benchmark: "BBQ", axis: sample?.cls ?? visibleBbq[0] });
  }

  function toggleClass(label: string) {
    setDraftClasses((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  function selectAllClasses() {
    setDraftClasses((current) => {
      const next = new Set(current);
      for (const label of classLabels) next.add(label);
      return [...next];
    });
  }

  function clearClasses() {
    const hidden = new Set(classLabels);
    setDraftClasses((current) => current.filter((label) => !hidden.has(label)));
  }

  const selectionChanged = !sameMembers(draftClasses, appliedClasses) || !sameWeights(draftWeights, appliedWeights);
  const appliedHere = classLabels.filter((label) => applied.has(label));
  const classStatus = classSelectionStatus(selectedFull, selectedSummary, classLabels, appliedHere, selectionChanged);

  async function onExport() {
    const node = document.getElementById("run-report");
    if (!node) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadRunPdf(node, `rai-run-${run.evaluationDate}-${selectedModel}.pdf`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export this run.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto min-w-0 max-w-7xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Responsible AI benchmark</h1>
          <p className="mt-1 text-sm text-muted">Bias, safety, and sycophancy across BBQ, BBG, WildGuard, and SYCON.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted" htmlFor="run-select">
            Run
          </label>
          <select
            id="run-select"
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
            value={run.id}
            onChange={(event) => router.push(`/?run=${event.target.value}`)}
          >
            {runs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.evaluationDate} · {item.judgeName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink disabled:opacity-60"
          >
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink underline decoration-[#e7e7ea] underline-offset-4"
          >
            GitHub
          </a>
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink underline decoration-[#e7e7ea] underline-offset-4"
          >
            Documentation
          </a>
        </div>
      </header>
      {exportError ? <p className="mt-3 text-sm text-[#083E73]">{exportError}</p> : null}

      <div id="run-report" className="mt-8 min-w-0 space-y-6 bg-canvas">
        <div>
          <h2 className="text-lg font-semibold text-ink">Run {run.evaluationDate}</h2>
          <p className="mt-1 text-sm text-muted">
            Judge {run.judgeName} · Prompt {run.evaluationPromptVersion} · {run.inputWorkbookName}
          </p>
          <p className="text-sm text-muted">
            {run.numberOfCasesEvaluated} cases · {run.numberOfModelResponsesEvaluated} model responses ·{" "}
            {run.numberOfSyconTurnsEvaluated} SYCON turns
          </p>
          <p className="mt-1 text-sm text-muted">
            Score is 1 minus the failure rate. Higher is better. {run.evaluationNotes}
          </p>
        </div>

        <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <label className="text-sm font-medium text-ink" htmlFor="model-select">
              Model
            </label>
            <select
              id="model-select"
              className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
            >
              {summaries.map((summary) => (
                <option key={summary.model} value={summary.model}>
                  {summary.model}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-muted">Choose a model to open its score and report.</p>
            <ScoreGauge score={selectedSummary?.composite ?? null} />
          </div>
          {selectedSummary ? <ModelCard summary={selectedSummary} /> : null}
        </section>

        {classLabels.length > 0 ? (
          <ClassFilter
            labels={classLabels}
            draft={draft}
            weights={draftWeights}
            canRecalculate={selectionChanged}
            status={classStatus}
            onToggle={toggleClass}
            onSelectAll={selectAllClasses}
            onClear={clearClasses}
            onWeight={(key, value) => setDraftWeights((current) => rebalanceWeights(current, key, value))}
            onRecalculate={() => {
              setAppliedClasses(draftClasses);
              setAppliedWeights(draftWeights);
            }}
          />
        ) : null}

        <PromptInspector
          model={selectedModel}
          benchmark={openAxis.benchmark}
          axis={openAxis.axis}
          {...promptsForAxis(openAxis.benchmark, openAxis.axis, selectedModel, replies)}
        />

        <div>
          <h2 className="text-lg font-semibold text-ink">{selectedModel} report</h2>
          <p className="mt-1 text-sm text-muted">
            Bars show {selectedModel} only. Run average is the unweighted mean of every model with a score on that
            axis.
          </p>
        </div>

        <section className="grid min-w-0 gap-4 lg:grid-cols-2">
          <div className="min-w-0 lg:col-span-2">
            <BenchmarkChart
              title="BBQ"
              caption="Failure rate by class (lower is better)"
              emptyLabel={classLabels.length > 0 ? "No classes selected." : undefined}
              model={selectedModel}
              data={bbq}
              onOpen={(axis) => setOpenAxis({ benchmark: "BBQ", axis })}
            />
          </div>
          <BenchmarkChart
            title="BBG"
            caption="Failure rate by class (lower is better)"
            model={selectedModel}
            data={bbg}
            onOpen={(axis) => setOpenAxis({ benchmark: "BBG", axis })}
          />
          <BenchmarkChart
            title="WildGuard"
            caption="Not scored in this run"
            model={selectedModel}
            data={wildguard}
            onOpen={(axis) => setOpenAxis({ benchmark: "WildGuard", axis })}
          />
          <div className="min-w-0 lg:col-span-2">
            <BenchmarkChart
              title="SYCON"
              caption="Not scored in this run"
              model={selectedModel}
              data={sycon}
              onOpen={(axis) => setOpenAxis({ benchmark: "SYCON", axis })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
