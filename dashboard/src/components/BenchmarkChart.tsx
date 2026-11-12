"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Customized, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { TRAFFIC, trafficBand, type TrafficName } from "@/lib/colors";
import { AVERAGE_SERIES, type ChartRow } from "@/lib/score";

type BenchmarkChartProps = {
  title: string;
  model: string;
  data: ChartRow[];
  caption?: string;
  emptyLabel?: string;
  onOpen: (axis: string) => void;
};

function axisMax(data: ChartRow[], model: string): number {
  let max = 0;
  for (const row of data) {
    for (const key of [model, AVERAGE_SERIES]) {
      const value = row[key];
      if (typeof value === "number" && value > max) max = value;
    }
  }
  if (max === 0) return 0.1;
  return Math.ceil(max * 1.3 * 20) / 20;
}

/** A measured 0 is a result ("no failures"), so it is labelled; only a missing value stays blank. */
function barLabel(value: unknown): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return value.toFixed(3);
}

function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

function StripePattern({ prefix }: { prefix: string }) {
  const bands = Object.entries(TRAFFIC) as Array<[TrafficName, (typeof TRAFFIC)[TrafficName]]>;
  return (
    <defs>
      {bands.map(([name, band]) => (
        <pattern
          key={name}
          id={`${prefix}-${name}`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(30)"
        >
          <rect width="6" height="6" fill={band.pale} />
          <rect width="2" height="6" fill={band.solid} />
        </pattern>
      ))}
    </defs>
  );
}

function bandFill(value: unknown, prefix: string, striped: boolean): { fill: string; stroke: string } {
  const band = trafficBand(typeof value === "number" ? value : null);
  if (!band) return { fill: "#E6EDF5", stroke: "#C5D4E4" };
  return {
    fill: striped ? `url(#${prefix}-${band})` : TRAFFIC[band].solid,
    stroke: TRAFFIC[band].solid,
  };
}

function axisFromBar(bar: unknown): string | null {
  if (!bar || typeof bar !== "object") return null;
  const record = bar as { axis?: unknown; payload?: { axis?: unknown } };
  const axis = record.payload?.axis ?? record.axis;
  return typeof axis === "string" ? axis : null;
}

export function BenchmarkChart({ title, model, data, caption, emptyLabel, onOpen }: BenchmarkChartProps) {
  const max = axisMax(data, model);
  const domain = useMemo(() => [0, max] as [number, number], [max]);
  const { ref, size } = useElementSize();
  // only letters, digits and dashes: "(" or ")" in an id breaks url(#...) and the bar renders black
  const patternId = `average-stripe-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const longestLabel = data.reduce((max, row) => Math.max(max, String(row.axis).length), 0);
  const crowded = data.length > 8;
  const narrow = size.width > 0 && (crowded || size.width < (longestLabel > 12 ? 760 : 480));

  return (
    <section className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="text-sm text-muted">
            {caption ?? "Failure rate (lower is better)"} · click a bar to change the prompts above
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-[#3CB371]" />
            Pass
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-[#F2C14E]" />
            Near
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-[#E25B5B]" />
            Fail
          </li>
          <li>{model} is solid</li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-[#3CB371]"
              style={{
                backgroundImage: "repeating-linear-gradient(135deg, #3CB371 0 2px, #D8F3E4 2px 5px)",
              }}
            />
            {AVERAGE_SERIES} is striped
          </li>
        </ul>
      </div>
      <div ref={ref} className="mt-4 h-80 min-w-0">
        {data.length === 0 ? (
          <p className="pt-16 text-center text-sm text-muted">{emptyLabel ?? "No scored rows for this benchmark."}</p>
        ) : size.width > 0 ? (
          <BarChart
            width={size.width}
            height={size.height}
            data={data}
            margin={{ top: 28, right: 8, left: 0, bottom: narrow ? 24 : 8 }}
            barGap={6}
            barCategoryGap="28%"
          >
            <Customized component={() => <StripePattern prefix={patternId} />} />
            <CartesianGrid vertical={false} stroke="#e3ebf3" />
            <XAxis
              dataKey="axis"
              tick={{ fill: "#4d6275", fontSize: narrow ? 11 : 12 }}
              tickLine={false}
              axisLine={{ stroke: "#d5e2ee" }}
              interval={0}
              angle={narrow ? -32 : 0}
              textAnchor={narrow ? "end" : "middle"}
              height={crowded ? 96 : narrow ? 72 : 30}
            />
            <YAxis
              domain={domain}
              tick={{ fill: "#4d6275", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(value: number) => value.toFixed(3)}
            />
            <Tooltip
              cursor={{ fill: "#f3f7fb" }}
              formatter={(value) => (typeof value === "number" ? value.toFixed(3) : "—")}
            />
            <Bar
              dataKey={model}
              radius={[3, 3, 0, 0]}
              maxBarSize={42}
              minPointSize={(value: unknown) => (typeof value === "number" ? 2 : 0)}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(bar) => {
                const axis = axisFromBar(bar);
                if (axis) onOpen(axis);
              }}
            >
              {data.map((row) => {
                const paint = bandFill(row[model], patternId, false);
                return <Cell key={`model-${String(row.axis)}`} fill={paint.fill} />;
              })}
              <LabelList dataKey={model} position="top" formatter={barLabel} style={{ fill: "#16324f", fontSize: 11 }} />
            </Bar>
            <Bar
              dataKey={AVERAGE_SERIES}
              radius={[3, 3, 0, 0]}
              maxBarSize={42}
              minPointSize={(value: unknown) => (typeof value === "number" ? 2 : 0)}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(bar) => {
                const axis = axisFromBar(bar);
                if (axis) onOpen(axis);
              }}
            >
              {data.map((row) => {
                const paint = bandFill(row[AVERAGE_SERIES], patternId, true);
                return <Cell key={`average-${String(row.axis)}`} fill={paint.fill} stroke={paint.stroke} strokeWidth={1} />;
              })}
              <LabelList
                dataKey={AVERAGE_SERIES}
                position="top"
                formatter={barLabel}
                style={{ fill: "#16324f", fontSize: 11 }}
              />
            </Bar>
          </BarChart>
        ) : null}
      </div>
    </section>
  );
}
