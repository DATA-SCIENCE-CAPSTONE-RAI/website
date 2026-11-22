import fs from "node:fs";
import path from "node:path";

/**
 * The evaluation backend's option lists saved by `npm run snapshot` (data/backend-snapshot.json),
 * served by the /api/backend proxy when READ_ONLY=1, so the Evaluation page can be explored with no
 * backend. Only these GET paths are answered; everything else (checks, runs, jobs) is refused.
 */
export const SNAPSHOT_PATHS = ["status", "categories", "sizes", "keys", "judges", "models", "weights"] as const;

export function snapshotFile(): string {
  return path.join(process.cwd(), "data", "backend-snapshot.json");
}

export function readSnapshot(): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(snapshotFile(), "utf8"));
  } catch {
    return null;
  }
}
