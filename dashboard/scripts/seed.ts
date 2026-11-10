import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(process.cwd(), "data", "rai.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (fs.existsSync(dbPath)) fs.rmSync(dbPath);

const db = new DatabaseSync(dbPath);
db.exec(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
db.exec(fs.readFileSync(path.join(process.cwd(), "db", "example_output.sql"), "utf8"));

const rows = db
  .prepare(`SELECT model, test, score, n FROM score_summary WHERE run_id = 1 ORDER BY id`)
  .all() as Array<{ model: string; test: string; score: number | null; n: number | null }>;

const expected: Record<string, number | null> = {
  "Claude|BBQ": 0.9605,
  "Claude|BBG": 0,
  "Claude|OVERALL": 0.4803,
  "GPT|BBQ": 0.9868,
  "GPT|BBG": 1,
  "GPT|OVERALL": 0.9934,
  "Gemini|BBQ": 0.9868,
  "Gemini|BBG": 1,
  "Gemini|OVERALL": 0.9934,
};

for (const [key, score] of Object.entries(expected)) {
  if (score === null) continue;
  const [model, test] = key.split("|");
  const row = rows.find((item) => item.model === model && item.test === test);
  if (!row || row.score === null || Math.abs(row.score - score) > 0.0001) {
    throw new Error(`Expected ${key} = ${score}, received ${row?.score ?? "missing"}`);
  }
}

const geminiBbg = rows.find((row) => row.model === "Gemini" && row.test === "BBG");
if (geminiBbg?.n !== 4) throw new Error(`Expected Gemini BBG n = 4, received ${geminiBbg?.n}`);

const classCount = db.prepare(`SELECT COUNT(*) AS n FROM score_by_class`).get() as { n: number };
const replyCount = db.prepare(`SELECT COUNT(*) AS n FROM derived_replies`).get() as { n: number };
const judgeCount = db.prepare(`SELECT COUNT(*) AS n FROM judge_output`).get() as { n: number };
if (classCount.n !== 64 || replyCount.n !== 13 || judgeCount.n !== 8) {
  throw new Error(`Unexpected row counts: classes ${classCount.n}, replies ${replyCount.n}, judge ${judgeCount.n}`);
}

db.close();
console.log(`Wrote ${dbPath} from db/example_output.sql`);
