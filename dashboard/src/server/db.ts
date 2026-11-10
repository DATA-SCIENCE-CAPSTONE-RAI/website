import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ScoreClassRow, ScoreSummaryRow } from "@/lib/score";
import type { Flag } from "@/lib/score";
import type { CaseEvaluation, DerivedReply, EvaluationRun, SyconTurn } from "@/lib/types";

export function sqlitePath(): string {
  return process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(process.cwd(), "data", "rai.sqlite");
}

export function databaseExists(): boolean {
  return fs.existsSync(sqlitePath());
}

function withDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(sqlitePath(), { readOnly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function flag(value: unknown): Flag {
  if (value === null || value === undefined) return null;
  if (value === 0 || value === 1) return value;
  throw new Error(`Expected a flag of 0, 1, or null, received ${String(value)}`);
}

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

type RunRow = {
  id: number;
  judge_name: string;
  evaluation_date: string;
  input_workbook_name: string;
  evaluation_prompt_version: string;
  evaluated_models: string;
  number_of_cases_evaluated: number;
  number_of_model_responses_evaluated: number;
  number_of_sycon_turns_evaluated: number;
  evaluation_notes: string | null;
};

function mapRun(row: RunRow): EvaluationRun {
  return {
    id: row.id,
    judgeName: row.judge_name,
    evaluationDate: row.evaluation_date,
    inputWorkbookName: row.input_workbook_name,
    evaluationPromptVersion: row.evaluation_prompt_version,
    evaluatedModels: row.evaluated_models,
    numberOfCasesEvaluated: row.number_of_cases_evaluated,
    numberOfModelResponsesEvaluated: row.number_of_model_responses_evaluated,
    numberOfSyconTurnsEvaluated: row.number_of_sycon_turns_evaluated,
    evaluationNotes: row.evaluation_notes,
  };
}

const runColumns = `id, judge_name, evaluation_date, input_workbook_name, evaluation_prompt_version,
  evaluated_models, number_of_cases_evaluated, number_of_model_responses_evaluated,
  number_of_sycon_turns_evaluated, evaluation_notes`;

export function listRuns(): EvaluationRun[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT ${runColumns}
         FROM evaluation_runs
         ORDER BY evaluation_date DESC, id DESC`,
      )
      .all() as RunRow[];
    return rows.map(mapRun);
  });
}

export function getRun(id: number): EvaluationRun | null {
  return withDb((db) => {
    const row = db.prepare(`SELECT ${runColumns} FROM evaluation_runs WHERE id = ?`).get(id) as
      | RunRow
      | undefined;
    return row ? mapRun(row) : null;
  });
}

type CaseRow = {
  id: number;
  run_id: number;
  case_id: string;
  source_sheet: string;
  source_row: number;
  task_type: string;
  protected_class_category: string | null;
  prompt_variant: string | null;
  evaluated_model: string;
  bbq_stereotype_answer: number | null;
  bbq_counter_stereotype_answer: number | null;
  bbq_unknown_answer: number | null;
  bbq_answer_correct: number | null;
  bbq_context_answerable: number | null;
  bbq_appropriate_abstention: number | null;
  bbq_answer_when_answerable: number | null;
  bbg_pair_id: string | null;
  bbg_version: string | null;
  bbg_primary_stereotype_reinforced: number | null;
  bbg_primary_stereotype_challenged: number | null;
  wildguard_response_harmful: number | null;
  wildguard_response_refusal: number | null;
  evaluation_evidence: string | null;
  evaluation_explanation: string | null;
  judgment_confidence: string | null;
  null_reason: string | null;
  judge_notes: string | null;
};

export function getCases(runId: number): CaseEvaluation[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT * FROM case_evaluations
         WHERE run_id = ?
         ORDER BY id ASC`,
      )
      .all(runId) as CaseRow[];
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      caseId: row.case_id,
      sourceSheet: row.source_sheet,
      sourceRow: row.source_row,
      taskType: row.task_type,
      protectedClassCategory: text(row.protected_class_category),
      promptVariant: text(row.prompt_variant),
      evaluatedModel: row.evaluated_model,
      bbqStereotypeAnswer: flag(row.bbq_stereotype_answer),
      bbqCounterStereotypeAnswer: flag(row.bbq_counter_stereotype_answer),
      bbqUnknownAnswer: flag(row.bbq_unknown_answer),
      bbqAnswerCorrect: flag(row.bbq_answer_correct),
      bbqContextAnswerable: flag(row.bbq_context_answerable),
      bbqAppropriateAbstention: flag(row.bbq_appropriate_abstention),
      bbqAnswerWhenAnswerable: flag(row.bbq_answer_when_answerable),
      bbgPairId: text(row.bbg_pair_id),
      bbgVersion: text(row.bbg_version),
      bbgPrimaryStereotypeReinforced: flag(row.bbg_primary_stereotype_reinforced),
      bbgPrimaryStereotypeChallenged: flag(row.bbg_primary_stereotype_challenged),
      wildguardResponseHarmful: flag(row.wildguard_response_harmful),
      wildguardResponseRefusal: flag(row.wildguard_response_refusal),
      evaluationEvidence: text(row.evaluation_evidence),
      evaluationExplanation: text(row.evaluation_explanation),
      judgmentConfidence: text(row.judgment_confidence),
      nullReason: text(row.null_reason),
      judgeNotes: text(row.judge_notes),
    }));
  });
}

type TurnRow = {
  id: number;
  run_id: number;
  case_id: string;
  sycon_conversation_id: string;
  evaluated_model: string;
  sycon_turn_number: number;
  sycon_sycophantic_flip: number | null;
  sycon_evidence: string | null;
  sycon_judgment_notes: string | null;
  judgment_confidence: string | null;
  null_reason: string | null;
};

export function getScoreSummary(runId: number): ScoreSummaryRow[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT model, test, score, n, verdict
         FROM score_summary
         WHERE run_id = ?
         ORDER BY id ASC`,
      )
      .all(runId) as Array<{
      model: string;
      test: string;
      score: number | null;
      n: number | null;
      verdict: string | null;
    }>;
    return rows.map((row) => ({
      model: row.model,
      test: row.test,
      score: row.score,
      n: row.n,
      verdict: text(row.verdict),
    }));
  });
}

export function getScoreByClass(runId: number): ScoreClassRow[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT model, test, class, failure_rate, n
         FROM score_by_class
         WHERE run_id = ?
         ORDER BY id ASC`,
      )
      .all(runId) as Array<{ model: string; test: string; class: string; failure_rate: number; n: number }>;
    return rows.map((row) => ({
      model: row.model,
      test: row.test,
      cls: row.class,
      failureRate: row.failure_rate,
      n: row.n,
    }));
  });
}

export function getDerivedReplies(runId: number): DerivedReply[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT * FROM derived_replies
         WHERE run_id = ?
         ORDER BY id ASC`,
      )
      .all(runId) as Array<{
      id: number;
      judge: string;
      model: string;
      test: string;
      reply_id: string;
      cls: string | null;
      variant: string | null;
      answer_correct: number | null;
      appropriate_abstention: number | null;
      reinforced: number | null;
      challenged: number | null;
      names_a_person: number | null;
      negative_actor: string | null;
      positive_actor: string | null;
      expected_letter: string | null;
      selected_letter: string | null;
      read_by: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      judge: row.judge,
      model: row.model,
      test: row.test,
      replyId: row.reply_id,
      cls: text(row.cls),
      variant: text(row.variant),
      answerCorrect: flag(row.answer_correct),
      appropriateAbstention: flag(row.appropriate_abstention),
      reinforced: flag(row.reinforced),
      challenged: flag(row.challenged),
      namesAPerson: flag(row.names_a_person),
      negativeActor: text(row.negative_actor),
      positiveActor: text(row.positive_actor),
      expectedLetter: text(row.expected_letter),
      selectedLetter: text(row.selected_letter),
      readBy: text(row.read_by),
    }));
  });
}

export function getSyconTurns(runId: number): SyconTurn[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT * FROM sycon_turns
         WHERE run_id = ?
         ORDER BY evaluated_model ASC, sycon_turn_number ASC, id ASC`,
      )
      .all(runId) as TurnRow[];
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      caseId: row.case_id,
      syconConversationId: row.sycon_conversation_id,
      evaluatedModel: row.evaluated_model,
      syconTurnNumber: row.sycon_turn_number,
      syconSycophanticFlip: flag(row.sycon_sycophantic_flip),
      syconEvidence: text(row.sycon_evidence),
      syconJudgmentNotes: text(row.sycon_judgment_notes),
      judgmentConfidence: text(row.judgment_confidence),
      nullReason: text(row.null_reason),
    }));
  });
}
