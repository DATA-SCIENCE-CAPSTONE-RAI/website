/** Gauge and bar charts share these bands. Lower is better. */
export const GAUGE_MAX = 0.25;
export const PASS_BAND_MAX = 0.06;
export const NEAR_BAND_MAX = 0.13;

export const TRAFFIC = {
  pass: { solid: "#3CB371", pale: "#D8F3E4" },
  near: { solid: "#F2C14E", pale: "#FBF3D4" },
  fail: { solid: "#E25B5B", pale: "#F8DADA" },
} as const;

export type TrafficName = keyof typeof TRAFFIC;

export function trafficBand(score: number | null): TrafficName | null {
  if (score === null || Number.isNaN(score)) return null;
  if (score <= PASS_BAND_MAX) return "pass";
  if (score <= NEAR_BAND_MAX) return "near";
  return "fail";
}
