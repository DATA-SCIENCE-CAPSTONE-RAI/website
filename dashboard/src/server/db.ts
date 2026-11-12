import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ScoreClassRow, ScoreSummaryRow } from "@/lib/score";
import type { Agreement, BiasGen, Reply, ScoreView, TestName } from "@/lib/types";

/**
 * Reads the evaluation backend's results database (raieval, docs/results-schema.md there).
 * The backend writes it with `raieval export` / `judge` / `score`; this file only reads it.
 * One view of the dashboard = one release scored with one judge. Judges are never merged.
 */

export const SCHEMA_VERSION = "6";

/** Example replies sent to the browser per model × test × category × passed/flagged. */
const REPLIES_PER_GROUP = 25;

export function sqlitePath(): string {
  return process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(process.cwd(), "data", "results.sqlite");
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

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Null when the file is the version this dashboard reads; otherwise what it found. */
export function schemaProblem(): string | null {
  return withDb((db) => {
    try {
      const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
        | { value: string }
        | undefined;
      if (row?.value === SCHEMA_VERSION) return null;
      return `The results database is schema v${row?.value ?? "?"}; this dashboard reads v${SCHEMA_VERSION}.`;
    } catch {
      return "This file is not a results database from the evaluation backend.";
    }
  });
}

/** Every release × judge that has been scored, newest first. */
export function listViews(): ScoreView[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT release, judge, MAX(scored_at) AS scored_at, MAX(method_version) AS method_version,
                COUNT(DISTINCT model) AS models
         FROM scores
         WHERE test = 'overall' AND metric = 'score'
         GROUP BY release, judge
         ORDER BY scored_at DESC, release, judge`,
      )
      .all() as Array<{ release: string; judge: string; scored_at: string; method_version: string | null; models: number }>;
    return rows.map((row) => ({
      release: row.release,
      judge: row.judge,
      scoredAt: row.scored_at,
      methodVersion: text(row.method_version),
      models: row.models,
    }));
  });
}

/** Per model and test: score, n, verdict, weight; `overall` lists the tests it combines. */
export function getScoreSummary(view: ScoreView): ScoreSummaryRow[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT s.model, s.test, s.value AS score, s.text AS overall_tests,
                f.n AS n, v.text AS verdict, w.value AS weight, sm.text AS subset
         FROM scores s
         LEFT JOIN scores f ON f.model = s.model AND f.judge = s.judge AND f.release = s.release
              AND f.test = s.test AND f.category = 'all' AND f.metric = 'failure_rate'
         LEFT JOIN scores v ON v.model = s.model AND v.judge = s.judge AND v.release = s.release
              AND v.test = s.test AND v.category = 'all' AND v.metric = 'verdict'
         LEFT JOIN scores w ON w.model = s.model AND w.judge = s.judge AND w.release = s.release
              AND w.test = s.test AND w.category = 'all' AND w.metric = 'weight'
         LEFT JOIN scores sm ON sm.model = s.model AND sm.judge = s.judge AND sm.release = s.release
              AND sm.test = s.test AND sm.category = 'all' AND sm.metric = 'subset'
         WHERE s.release = ? AND s.judge = ? AND s.category = 'all' AND s.metric = 'score'
         ORDER BY s.model, s.test`,
      )
      .all(view.release, view.judge) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      model: String(row.model),
      test: String(row.test),
      score: num(row.score),
      n: num(row.n),
      verdict: text(row.verdict),
      weight: num(row.weight),
      subset: text(row.subset),
      includes: row.test === "overall" && row.overall_tests ? (JSON.parse(String(row.overall_tests)) as string[]) : null,
    }));
  });
}

/**
 * Failure rate per category, labelled from the `categories` table. BBG has no per-class failure
 * rate: its per-class number is the signed bias_gen, shown here as |bias_gen| (the BBG failure).
 * Safety prompts are one group named `Safety`; a category the release does not label keeps its id.
 */
export function getScoreByClass(view: ScoreView): ScoreClassRow[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT s.model, s.test, COALESCE(c.label, s.category) AS label, ABS(s.value) AS value, s.n
         FROM scores s
         LEFT JOIN categories c ON c.release = s.release AND c.category = s.category
         WHERE s.release = ? AND s.judge = ? AND s.category != 'all'
           AND (s.metric = 'failure_rate' OR (s.test = 'BBG' AND s.metric = 'bias_gen_signed'))
         ORDER BY s.model, s.test, label`,
      )
      .all(view.release, view.judge) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      model: String(row.model),
      test: String(row.test),
      cls: String(row.label),
      failureRate: Number(row.value),
      n: Number(row.n),
    }));
  });
}

/** BBG: signed bias_gen with its 95% interval and the plain reading, per model. */
export function getBiasGen(view: ScoreView): Record<string, BiasGen> {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT model, value, ci_low, ci_high, text
         FROM scores
         WHERE release = ? AND judge = ? AND test = 'BBG' AND category = 'all' AND metric = 'bias_gen_signed'`,
      )
      .all(view.release, view.judge) as Array<Record<string, unknown>>;
    const out: Record<string, BiasGen> = {};
    for (const row of rows) {
      out[String(row.model)] = {
        value: num(row.value),
        low: num(row.ci_low),
        high: num(row.ci_high),
        reading: text(row.text),
      };
    }
    return out;
  });
}

/** Agreement between this judge and each other judge: Cohen's kappa, and the share of labels that match. */
export function getAgreement(view: ScoreView): Agreement[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT model, test, judge, value, text, n
         FROM scores
         WHERE release = ? AND metric = 'kappa' AND (judge LIKE ? OR judge LIKE ?)
         ORDER BY model, test, judge`,
      )
      .all(view.release, `${view.judge}|%`, `%|${view.judge}`) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const [a, b] = String(row.judge).split("|");
      return {
        model: String(row.model),
        test: String(row.test),
        otherJudge: a === view.judge ? b : a,
        kappa: num(row.value),
        agreement: num(/agreement=([\d.]+)/.exec(String(row.text ?? ""))?.[1]),
        n: num(row.n),
      };
    });
  });
}

const TEST_OF_STAGE: Record<string, TestName> = { mcq: "BBQ", open: "BBG", safety: "Safety", pushback: "Pushback" };

/**
 * Example replies for the probe review: the runs this view scored, with this judge's result
 * (multiple choice: `script`) and its evidence. Pushback: one row per conversation (its last
 * turn), since the result is per conversation. Capped per group so the page stays small.
 */
export function getReplies(view: ScoreView): Reply[] {
  return withDb((db) => {
    const runIds = new Set<string>();
    const scored = db
      .prepare(
        `SELECT run_ids FROM scores
         WHERE release = ? AND judge = ? AND category = 'all' AND metric = 'score' AND test != 'overall'`,
      )
      .all(view.release, view.judge) as Array<{ run_ids: string | null }>;
    for (const row of scored) for (const id of JSON.parse(row.run_ids ?? "[]") as string[]) runIds.add(id);
    if (runIds.size === 0) return [];
    const ids = [...runIds];
    const rows = db
      .prepare(
        `WITH picked AS (
           SELECT r.run_id, r.item_id, r.epoch, r.model, r.stage, r.chain_id, r.turn,
                  CASE WHEN r.stage = 'safety' OR r.row_type = 'SAFETY' THEN 'Safety'
                       ELSE COALESCE(c.label, r.category) END AS cls,
                  r.prompt, r.response, r.status,
                  ir.result, ir.result_reason, j.evidence, j.notes
           FROM responses r
           JOIN item_results ir ON ir.run_id = r.run_id AND ir.item_id = r.item_id AND ir.epoch = r.epoch
                AND ir.judge = CASE WHEN r.stage = 'mcq' THEN 'script' ELSE ? END
           LEFT JOIN judgments j ON j.run_id = r.run_id AND j.item_id = r.item_id AND j.epoch = r.epoch
                AND j.judge = ?
           LEFT JOIN categories c ON c.release = ? AND c.category = r.category
           WHERE r.run_id IN (${ids.map(() => "?").join(", ")})
             AND (r.stage != 'pushback'
                  OR r.turn = (SELECT MAX(t.turn) FROM responses t WHERE t.run_id = r.run_id AND t.chain_id = r.chain_id))
         ), ranked AS (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY model, stage, cls, result = 'pass' ORDER BY item_id, epoch) AS rank,
             COUNT(*) OVER (PARTITION BY model, stage, cls, result = 'pass') AS group_total
           FROM picked
         )
         SELECT * FROM ranked WHERE rank <= ${REPLIES_PER_GROUP}
         ORDER BY model, stage, cls, item_id`,
      )
      .all(view.judge, view.judge, view.release, ...ids) as Array<Record<string, unknown>>;
    const firstPrompt = db.prepare(`SELECT prompt FROM responses WHERE run_id = ? AND chain_id = ? AND turn = 0`);
    return rows.map((row) => {
      const pushback = row.stage === "pushback";
      const first = pushback
        ? (firstPrompt.get(String(row.run_id), String(row.chain_id)) as { prompt: string } | undefined)
        : undefined;
      return {
        id: `${row.run_id}:${row.item_id}:${row.epoch}`,
        model: String(row.model),
        test: TEST_OF_STAGE[String(row.stage)] ?? (String(row.stage) as TestName),
        cls: String(row.cls),
        prompt: pushback ? (first?.prompt ?? null) : text(row.prompt),
        lastUserMessage: pushback ? text(row.prompt) : null,
        turn: pushback ? num(row.turn) : null,
        response: text(row.response),
        status: text(row.status),
        result: text(row.result),
        resultReason: text(row.result_reason),
        evidence: text(row.evidence),
        notes: text(row.notes),
        groupTotal: Number(row.group_total),
      };
    });
  });
}
