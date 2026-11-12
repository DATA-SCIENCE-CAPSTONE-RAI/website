"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BenchmarkChart } from "@/components/BenchmarkChart";
import { ModelCard } from "@/components/ModelCard";
import { PromptInspector } from "@/components/PromptInspector";
import { ScoreGauge } from "@/components/ScoreGauge";
import { promptsForAxis, type BenchmarkName } from "@/lib/examples";
import { downloadRunPdf } from "@/lib/pdf";
import { reportChartRows, type ModelSummary } from "@/lib/score";
import type { Agreement, Reply, ScoreView } from "@/lib/types";

type DashboardProps = {
  view: ScoreView;
  views: ScoreView[];
  summaries: ModelSummary[];
  replies: Reply[];
  agreement: Agreement[];
  githubUrl: string;
  docsUrl: string;
};

const viewKey = (view: ScoreView) => `${view.release}|${view.judge}`;

function openingAxis(summaries: ModelSummary[], replies: Reply[]): { benchmark: BenchmarkName; axis: string } {
  const model = summaries[0]?.model;
  const sample = replies.find((row) => row.model === model && row.test === "BBQ" && row.cls);
  if (sample?.cls) return { benchmark: "BBQ", axis: sample.cls };
  const bbq = summaries[0]?.bbqByClass[0];
  if (bbq) return { benchmark: "BBQ", axis: bbq.label };
  const bbg = summaries[0]?.bbgByClass[0];
  if (bbg) return { benchmark: "BBG", axis: bbg.label };
  return { benchmark: "BBQ", axis: "" };
}

export function Dashboard({ view, views, summaries, replies, agreement, githubUrl, docsUrl }: DashboardProps) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(summaries[0]?.model ?? "");
  const [openAxis, setOpenAxis] = useState<{ benchmark: BenchmarkName; axis: string }>(() =>
    openingAxis(summaries, replies),
  );

  useEffect(() => {
    if (!summaries.some((summary) => summary.model === selectedModel)) {
      setSelectedModel(summaries[0]?.model ?? "");
    }
  }, [summaries, selectedModel, view.release, view.judge]);

  const selectedSummary = summaries.find((summary) => summary.model === selectedModel) ?? null;
  const bbq = reportChartRows(summaries, selectedModel, (summary) => summary.bbqByClass);
  const bbg = reportChartRows(summaries, selectedModel, (summary) => summary.bbgByClass);
  const safety = reportChartRows(summaries, selectedModel, (summary) => summary.wgBySheet);
  const pushback = reportChartRows(summaries, selectedModel, (summary) => summary.syconByClass);
  const modelAgreement = agreement.filter((row) => row.model === selectedModel);

  async function onExport() {
    const node = document.getElementById("run-report");
    if (!node) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadRunPdf(node, `rai-${view.release}-${view.scoredAt.slice(0, 10)}-${selectedModel.replace(/[^\w.-]+/g, "-")}.pdf`);
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
          <p className="mt-1 text-sm text-muted">Bias, safety, and sycophancy: BBQ, BBG, Safety (WildGuardTest), and Pushback.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted" htmlFor="view-select">
            Release · judge
          </label>
          <select
            id="view-select"
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
            value={viewKey(view)}
            onChange={(event) => {
              const [release, judge] = event.target.value.split("|");
              router.push(`/?release=${encodeURIComponent(release)}&judge=${encodeURIComponent(judge)}`);
            }}
          >
            {views.map((item) => (
              <option key={viewKey(item)} value={viewKey(item)}>
                {item.release} · {item.judge}
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
          <h2 className="text-lg font-semibold text-ink">Release {view.release}</h2>
          <p className="mt-1 text-sm text-muted">
            Judge {view.judge} · Scored {view.scoredAt.slice(0, 16).replace("T", " ")} · Rules{" "}
            {view.methodVersion ?? "—"} · {view.models} {view.models === 1 ? "model" : "models"}
          </p>
          <p className="mt-1 text-sm text-muted">
            Score is 1 minus the failure rate. Higher is better. BBQ is read without a judge, so it is the same under
            every judge. Judges are never merged: pick another judge above to compare.
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
              model={selectedModel}
              data={bbq}
              onOpen={(axis) => setOpenAxis({ benchmark: "BBQ", axis })}
            />
          </div>
          <BenchmarkChart
            title="BBG"
            caption="|bias_gen| by class: how far stories lean either way (lower is better)"
            model={selectedModel}
            data={bbg}
            onOpen={(axis) => setOpenAxis({ benchmark: "BBG", axis })}
          />
          <BenchmarkChart
            title="Safety (WildGuardTest)"
            caption={safety.length ? "Failure rate: unsafe help or over-refusal (lower is better)" : "Not scored in this view"}
            model={selectedModel}
            data={safety}
            onOpen={(axis) => setOpenAxis({ benchmark: "Safety", axis })}
          />
          <div className="min-w-0 lg:col-span-2">
            <BenchmarkChart
              title="Pushback"
              caption={
                pushback.length
                  ? "Failure rate by class: left a justified answer under pushback (lower is better)"
                  : "Not scored in this view"
              }
              model={selectedModel}
              data={pushback}
              onOpen={(axis) => setOpenAxis({ benchmark: "Pushback", axis })}
            />
          </div>
        </section>

        {modelAgreement.length ? (
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-ink">Agreement with other judges</h3>
            <p className="mt-1 text-sm text-muted">
              Cohen&apos;s kappa on each test&apos;s main label for {selectedModel}. Low agreement means the scores above
              depend on the judge.
            </p>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 font-medium">Test</th>
                  <th className="py-1 font-medium">Other judge</th>
                  <th className="py-1 font-medium">Kappa</th>
                  <th className="py-1 font-medium">Agreement</th>
                  <th className="py-1 font-medium">n</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-ink">
                {modelAgreement.map((row) => (
                  <tr key={`${row.test}-${row.otherJudge}`} className="border-t border-line">
                    <td className="py-1">{row.test}</td>
                    <td className="py-1">{row.otherJudge}</td>
                    <td className="py-1">{row.kappa === null ? "—" : row.kappa.toFixed(2)}</td>
                    <td className="py-1">{row.agreement === null ? "—" : `${Math.round(row.agreement * 100)}%`}</td>
                    <td className="py-1">{row.n ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </div>
  );
}
