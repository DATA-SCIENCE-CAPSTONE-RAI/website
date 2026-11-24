"use client";

import { useState } from "react";
import { backend, type SavedUpload, type UploadCheck, type UploadFormat, type UploadIssue } from "@/lib/backend";
import { formatCount } from "@/lib/evalSetup";

const MAX_FILE_BYTES = 2_000_000;

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm";
const primary = "rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60";
const secondary = "rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink disabled:opacity-60";

type Picked = { name: string; text: string };

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function where(issue: UploadIssue): string {
  return [issue.file, issue.row ? `row ${issue.row}` : null, issue.column].filter(Boolean).join(" · ") || "Upload";
}

function IssueTable({ issues, tone }: { issues: UploadIssue[]; tone: "error" | "warning" }) {
  if (!issues.length) return null;
  return (
    <div className="mt-3">
      <p className={`text-sm font-medium ${tone === "error" ? "text-[#9b2c2c]" : "text-ink"}`}>
        {tone === "error" ? `${issues.length} problem${issues.length === 1 ? "" : "s"} to fix` : `${issues.length} note${issues.length === 1 ? "" : "s"}`}
      </p>
      <div className="mt-1 max-h-72 overflow-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-[#f7f9fc] text-muted">
            <tr>
              <th className="px-3 py-1.5 font-medium">Where</th>
              <th className="px-3 py-1.5 font-medium">{tone === "error" ? "Problem" : "Note"}</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, index) => (
              <tr key={index} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-1.5 text-muted">{where(issue)}</td>
                <td className={`px-3 py-1.5 ${tone === "error" ? "text-[#9b2c2c]" : "text-ink"}`}>{issue.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function uploadSummary(counts: SavedUpload["counts"]): string {
  const parts = [];
  if (counts.scenarios) {
    parts.push(
      `${formatCount(counts.scenarios)} scenario${counts.scenarios === 1 ? "" : "s"} in ${counts.classes.length} class${
        counts.classes.length === 1 ? "" : "es"
      }: ${formatCount(counts.mcq.full)} questions and ${formatCount(counts.stories.full)} stories (lite: ${formatCount(
        counts.mcq.lite,
      )} and ${formatCount(counts.stories.lite)})`,
    );
  }
  if (counts.safety.total) {
    parts.push(
      `${formatCount(counts.safety.total)} safety prompt${counts.safety.total === 1 ? "" : "s"} (${formatCount(
        counts.safety.harmful,
      )} harmful, ${formatCount(counts.safety.adversarial)} adversarial)`,
    );
  }
  return parts.join(" · ");
}

type Props = {
  readOnly: boolean;
  format: UploadFormat | null;
  saved: SavedUpload[];
  selected: string[];
  selectable: boolean;
  onToggle: (release: string) => void;
  onSaved: (upload: SavedUpload) => void;
};

/** Upload your own prompts: the format guide, a check of the files, then saving them as a set. */
export function PromptUpload({ readOnly, format, saved, selected, selectable, onToggle, onSaved }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadCheck | null>(null);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNow, setSavedNow] = useState<string | null>(null);

  const key = JSON.stringify([name.trim(), files]);
  const current = result !== null && checkedFor === key;

  async function pick(list: FileList | null) {
    setResult(null);
    setSavedNow(null);
    setFileError(null);
    const chosen = Array.from(list ?? []);
    const big = chosen.find((file) => file.size > MAX_FILE_BYTES);
    if (big) {
      setFiles([]);
      setFileError(`${big.name} is larger than ${MAX_FILE_BYTES / 1_000_000} MB.`);
      return;
    }
    setFiles(await Promise.all(chosen.map(async (file) => ({ name: file.name, text: await file.text() }))));
    if (!name.trim() && chosen[0]) setName(chosen[0].name.replace(/\.[^.]+$/, ""));
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const check = () =>
    run("check", async () => {
      setResult(await backend.checkUpload({ name: name.trim(), files }));
      setCheckedFor(key);
      setSavedNow(null);
    });

  const save = () =>
    run("save", async () => {
      const upload = await backend.saveUpload({ name: name.trim(), files });
      setSavedNow(upload.name);
      onSaved(upload);
    });

  return (
    <div className={card}>
      <h2 className="text-lg font-semibold text-ink">Your prompts</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Upload your own prompts in our format to test a model on scenarios from your own work. Each upload is checked,
        saved as its own set, run like the dataset, and scored and shown on its own on the Scores page.
      </p>

      {format ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ink">Format</h3>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {(["scenarios", "safety"] as const).map((kind) => {
              const spec = format.kinds[kind];
              return (
                <div key={kind} className="rounded-xl border border-line p-4">
                  <p className="text-sm font-medium text-ink">{spec.title}</p>
                  <p className="mt-1 text-sm text-muted">{spec.about}</p>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-medium text-ink">Columns</summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <tbody>
                          {spec.columns.map((column) => (
                            <tr key={column.name} className="border-t border-line align-top">
                              <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-xs text-ink">
                                {column.name}
                                {column.required ? "" : <span className="ml-1 font-sans text-muted">(optional)</span>}
                              </td>
                              <td className="py-1.5 text-muted">
                                {column.about}
                                {column.example ? (
                                  <span className="mt-0.5 block text-xs text-ink">e.g. {column.example}</span>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <button
                    type="button"
                    className={`${secondary} mt-3`}
                    onClick={() => download(spec.file_name, spec.example_csv)}
                  >
                    Download example CSV
                  </button>
                </div>
              );
            })}
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            {format.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">The format guide comes from the evaluation backend.</p>
      )}

      <div className="mt-6 rounded-xl border border-[#ecd9a7] bg-[#fdf8ea] p-4">
        <p className="text-sm font-semibold text-ink">Do not include personal or confidential data in your prompts.</p>
        <p className="mt-1 text-sm text-muted">
          Prompts are sent to the model provider you choose, may be kept in their logs, and are stored in this tool&apos;s
          results and exports. Before uploading, remove names, addresses, phone numbers, email addresses, dates of birth,
          government ID numbers, health or financial information about real people, and anything marked confidential.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-ink"
            checked={confirmed}
            disabled={readOnly}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I confirm these prompts contain no personal or confidential data.
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink" htmlFor="upload-files">
          CSV files (one or more)
          <input
            id="upload-files"
            type="file"
            multiple
            accept=".csv,text/csv"
            disabled={readOnly || !confirmed}
            onChange={(event) => void pick(event.target.files)}
            className="mt-2 block w-full text-sm font-normal text-ink file:mr-3 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm disabled:opacity-50"
          />
        </label>
        <label className="block text-sm font-medium text-ink" htmlFor="upload-name">
          Name for this set
          <input
            id="upload-name"
            value={name}
            maxLength={60}
            disabled={readOnly || !confirmed}
            onChange={(event) => {
              setName(event.target.value);
              setSavedNow(null);
            }}
            placeholder="e.g. Benefits office scenarios"
            className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal text-ink disabled:opacity-50"
          />
        </label>
      </div>
      {fileError ? <p className="mt-2 text-sm text-[#9b2c2c]">{fileError}</p> : null}
      {files.length ? <p className="mt-2 text-sm text-muted">Selected: {files.map((file) => file.name).join(", ")}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={secondary}
          disabled={readOnly || !confirmed || !files.length || busy !== null}
          onClick={check}
        >
          {busy === "check" ? "Checking…" : "Check files"}
        </button>
        <button
          type="button"
          className={primary}
          disabled={readOnly || !confirmed || !current || !result?.ok || busy !== null || savedNow !== null}
          onClick={save}
        >
          {busy === "save" ? "Saving…" : "Save upload"}
        </button>
      </div>
      {readOnly ? <p className="mt-2 text-sm text-muted">Uploading is turned off on this demo site.</p> : null}
      {error ? <p className="mt-2 text-sm text-[#9b2c2c]">{error}</p> : null}
      {result && !current ? <p className="mt-2 text-sm text-muted">The files or name changed since the check. Check again.</p> : null}

      {result && current ? (
        <div className="mt-4" data-testid="upload-result">
          {result.ok ? (
            <div className="rounded-xl bg-[#eef8f1] px-4 py-3 text-sm text-ink">
              <p className="font-medium">
                {savedNow ? `Saved as “${savedNow}”.` : "The files are in the right format."}{" "}
                {result.counts ? uploadSummary(result.counts) : ""}.
              </p>
              {result.examples?.mcq ? (
                <div className="mt-2 text-muted">
                  <p>Example question: {result.examples.mcq.context}</p>
                  <p className="mt-1">
                    {result.examples.mcq.question} {result.examples.mcq.options.map((option, index) => `${"ABC"[index]}) ${option}`).join("  ")}
                  </p>
                  <p className="mt-1">Right answer: {result.examples.mcq.answer}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <IssueTable issues={result.errors} tone="error" />
          <IssueTable issues={result.warnings} tone="warning" />
        </div>
      ) : null}

      <div className="mt-6 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink">Saved uploads</h3>
        {saved.length ? (
          <ul className="mt-2 space-y-2">
            {saved.map((item) => (
              <li key={item.release}>
                <label className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${selected.includes(item.release) ? "border-ink/40 bg-[#f7f9fc]" : "border-line"}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-ink"
                    checked={selected.includes(item.release)}
                    disabled={!selectable}
                    onChange={() => onToggle(item.release)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{item.name}</span>
                    <span className="ml-2 text-muted">{item.created.slice(0, 10)}</span>
                    <span className="mt-0.5 block text-muted">{uploadSummary(item.counts)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">None yet.</p>
        )}
        {saved.length && !selectable ? (
          <p className="mt-2 text-sm text-muted">Choose &ldquo;Your uploaded prompts&rdquo; or &ldquo;Both&rdquo; above to run them.</p>
        ) : null}
      </div>
    </div>
  );
}
