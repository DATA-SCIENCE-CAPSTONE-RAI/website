import type { Flag } from "@/lib/score";
import type { DerivedReply } from "@/lib/types";

export type BenchmarkName = "BBQ" | "BBG" | "WildGuard" | "SYCON";

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

function flagText(flag: Flag | null): string {
  if (flag === null) return "—";
  return flag.toFixed(3);
}

function chip(label: string, value: string, emphasis: boolean): ScoreChip {
  return { label, value, emphasis };
}

function card(options: {
  id: string;
  failed: boolean;
  prompt: string;
  lead: string;
  highlight: string | null;
  scores: ScoreChip[];
}): PromptCard {
  return {
    id: options.id,
    heading: options.failed ? "Flagged response" : "Reference response",
    prompt: options.prompt,
    lead: options.lead,
    highlight: options.highlight,
    scores: options.scores,
  };
}

function bbqCards(axis: string, rows: DerivedReply[]): PromptCard[] {
  return rows.flatMap((row) => {
    if (row.test !== "BBQ" || row.cls !== axis) return [];
    if (row.answerCorrect !== 0 && row.answerCorrect !== 1) return [];
    return [
      card({
        id: `reply-${row.id}`,
        failed: row.answerCorrect === 0,
        prompt: [row.replyId, row.variant, row.cls].filter(Boolean).join(" · "),
        lead:
          row.expectedLetter || row.selectedLetter
            ? `Expected ${row.expectedLetter ?? "—"}, selected ${row.selectedLetter ?? "—"}.`
            : "",
        highlight: row.readBy ? `Read by ${row.readBy}.` : null,
        scores: [
          chip("Answer correct", flagText(row.answerCorrect), true),
          chip("Appropriate abstention", flagText(row.appropriateAbstention), false),
        ],
      }),
    ];
  });
}

function bbgCards(axis: string, rows: DerivedReply[]): PromptCard[] {
  return rows.flatMap((row) => {
    if (row.test !== "BBG" || row.cls !== axis) return [];
    if (row.namesAPerson !== 0 && row.namesAPerson !== 1) return [];
    return [
      card({
        id: `reply-${row.id}`,
        failed: row.namesAPerson === 1,
        prompt: [row.replyId, row.cls].filter(Boolean).join(" · "),
        lead: `Negative actor ${row.negativeActor ?? "—"}. Positive actor ${row.positiveActor ?? "—"}.`,
        highlight: null,
        scores: [
          chip("Names a person", flagText(row.namesAPerson), true),
          chip("Stereotype reinforced", flagText(row.reinforced), false),
          chip("Stereotype challenged", flagText(row.challenged), false),
        ],
      }),
    ];
  });
}

export function promptsForAxis(
  benchmark: BenchmarkName,
  axis: string,
  model: string,
  replies: DerivedReply[],
): { flagged: PromptCard[]; reference: PromptCard[] } {
  const rows = replies.filter((row) => row.model === model);
  const prompts =
    benchmark === "BBQ" ? bbqCards(axis, rows) : benchmark === "BBG" ? bbgCards(axis, rows) : [];
  return {
    flagged: prompts.filter((prompt) => prompt.heading === "Flagged response"),
    reference: prompts.filter((prompt) => prompt.heading === "Reference response"),
  };
}
