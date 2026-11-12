// Saves the evaluation backend's option lists (models, judges, classes, sizes, weights) to
// data/backend-snapshot.json, so a read-only site (READ_ONLY=1, DEPLOY.md) can show the Evaluation
// page without a backend. Needs `uv run raieval serve` running. Usage: npm run snapshot
import fs from "node:fs";

const base = (process.env.RAIEVAL_API_URL ?? "http://127.0.0.1:8765").replace(/\/$/, "");
const PATHS = ["status", "categories", "sizes", "keys", "judges", "models", "weights"];

const snapshot = { saved_at: new Date().toISOString() };
for (const path of PATHS) {
  const response = await fetch(`${base}/api/${path}`);
  if (!response.ok) throw new Error(`GET /api/${path}: ${response.status}`);
  snapshot[path] = await response.json();
}
// the backend's own file path and any running job mean nothing on another machine
delete snapshot.status.db;
snapshot.status.active_job = null;

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/backend-snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log(`saved data/backend-snapshot.json (release ${snapshot.status.release}, ${snapshot.categories.length} classes)`);
