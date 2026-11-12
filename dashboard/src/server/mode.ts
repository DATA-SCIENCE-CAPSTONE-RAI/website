/**
 * READ_ONLY=1 turns the site into a results viewer: no Evaluation page and no calls to the
 * evaluation backend (which can spend money on API keys). For a hosted demo with no backend.
 */
export function readOnly(): boolean {
  return ["1", "true", "yes"].includes((process.env.READ_ONLY ?? "").toLowerCase());
}
