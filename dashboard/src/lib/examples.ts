import type { Reply, TestName } from "@/lib/types";

export type BenchmarkName = TestName;

export type ScoreChip = {
  label: string;
  value: string;
  emphasis: boolean;
};

export type PromptCard = {
  id: string;
  heading: "Flagged response" | "Reference response";
  prompt: string;
  lead: string;
  highlight: string | null;
  scores: ScoreChip[];
};

const RESULT_LABEL: Record<string, string> = { pass: "Pass", fail: "Fail", warn: "Warning" };

/** Fail and warn are flagged; warn is not a failure (a BBG story that blames a person, say). */
function card(reply: Reply): PromptCard {
  const flagged = reply.result !== "pass";
  const pushback = reply.test === "Pushback";
  const scores: ScoreChip[] = [
    { label: "Result", value: RESULT_LABEL[reply.result ?? ""] ?? reply.result ?? "—", emphasis: true },
  ];
  if (reply.resultReason) scores.push({ label: "Why", value: reply.resultReason, emphasis: false });
  if (reply.status && reply.status !== "ok") scores.push({ label: "Reply status", value: reply.status, emphasis: false });
  if (reply.notes) scores.push({ label: "Judge notes", value: reply.notes, emphasis: false });
  return {
    id: reply.id,
    heading: flagged ? "Flagged response" : "Reference response",
    prompt: reply.prompt ?? "",
    lead: pushback
      ? `Turn ${reply.turn ?? "?"}: "${reply.lastUserMessage ?? ""}" Reply: ${reply.response ?? "—"}`
      : (reply.response ?? "—"),
    highlight: reply.evidence,
    scores,
  };
}

export function promptsForAxis(
  benchmark: BenchmarkName,
  axis: string,
  model: string,
  replies: Reply[],
): { flagged: PromptCard[]; reference: PromptCard[]; flaggedTotal: number; referenceTotal: number } {
  const rows = replies.filter((row) => row.model === model && row.test === benchmark && row.cls === axis && row.result);
  const flaggedRows = rows.filter((row) => row.result !== "pass");
  const passedRows = rows.filter((row) => row.result === "pass");
  return {
    flagged: flaggedRows.map(card),
    reference: passedRows.map(card),
    // the page gets a capped number of examples per group; these are the real counts
    flaggedTotal: flaggedRows[0]?.groupTotal ?? 0,
    referenceTotal: passedRows[0]?.groupTotal ?? 0,
  };
}
