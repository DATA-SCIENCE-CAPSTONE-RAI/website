import { TRAFFIC } from "@/lib/colors";
import { formatScore } from "@/lib/score";

const CX = 160;
const CY = 148;
const RADIUS = 104;

const ZONES = [
  { from: 0, to: 1 / 3, color: TRAFFIC.fail.solid },
  { from: 1 / 3, to: 2 / 3, color: TRAFFIC.near.solid },
  { from: 2 / 3, to: 1, color: TRAFFIC.pass.solid },
];

function point(t: number, radius: number) {
  const angle = Math.PI * (1 - t);
  return {
    x: CX + radius * Math.cos(angle),
    y: CY - radius * Math.sin(angle),
  };
}

function arc(from: number, to: number, radius: number) {
  const start = point(from, radius);
  const end = point(to, radius);
  const large = to - from > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
}

type ScoreGaugeProps = {
  score: number | null;
};

export function ScoreGauge({ score }: ScoreGaugeProps) {
  const placed = score === null ? null : Math.min(Math.max(score, 0), 1);
  const tip = placed === null ? null : point(placed, RADIUS - 16);
  const label = score === null
    ? "No overall score."
    : `Overall score ${formatScore(score)}. Higher is better. Red is below 0.333, yellow is in between, and green is 0.667 or above.`;

  return (
    <figure className="mt-2">
      <figcaption className="text-sm font-medium text-ink">Pass / fail position</figcaption>
      <svg viewBox="0 0 320 188" className="mx-auto mt-1 w-full max-w-sm" role="img" aria-label={label}>
        {ZONES.map((zone) => (
          <path
            key={`${zone.from}-${zone.to}`}
            d={arc(zone.from + 0.008, zone.to - 0.008, RADIUS)}
            fill="none"
            stroke={zone.color}
            strokeWidth="22"
            strokeLinecap="butt"
          />
        ))}
        <path d={arc(0.02, 0.98, RADIUS - 28)} fill="none" stroke="#C5D4E4" strokeWidth="2" strokeDasharray="2 5" />
        {tip ? (
          <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke="#5C6B7A" strokeWidth="5" strokeLinecap="round" />
        ) : null}
        <circle cx={CX} cy={CY} r="9" fill="#9AA6B2" />
        <circle cx={CX} cy={CY} r="4" fill="#ffffff" />
        <text x="28" y="176" fill="#4d6275" fontSize="12">
          0.000
        </text>
        <text x="292" y="176" textAnchor="end" fill="#4d6275" fontSize="12">
          1.000
        </text>
      </svg>
      <p className="text-center text-sm text-muted">Higher is better. Red, yellow, and green split the scale into thirds.</p>
    </figure>
  );
}
