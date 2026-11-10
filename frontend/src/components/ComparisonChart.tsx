import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Text, Tooltip, XAxis, YAxis } from "recharts";
import { useLanguage } from "../i18n/LanguageContext";
import { AXIS_STYLE, CHART, TOOLTIP_CURSOR, TOOLTIP_STYLE } from "../chartTheme";

export interface ChartDatum {
  name: string;
  short: string; // axis label: full names don't fit three per axis
  time: number;
  attempts: number;
  success: boolean;
}

// Wraps a label onto two lines when the bar slot is narrow (phones), instead of letting labels collide
function WrappingTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <Text x={x} y={(y ?? 0) + 4} width={96} textAnchor="middle" verticalAnchor="start" {...AXIS_STYLE}>
      {payload?.value ?? ""}
    </Text>
  );
}

export default function ComparisonChart({ data }: { data: ChartDatum[] }) {
  const { t } = useLanguage();
  if (data.length === 0) return null;
  const anyFailed = data.some((d) => !d.success);
  // interval 0: never let Recharts drop a category label to save space
  const xAxis = <XAxis dataKey="short" interval={0} height={40} tick={<WrappingTick />} />;
  const label = (_: unknown, payload: { payload?: ChartDatum }[]) => payload[0]?.payload?.name ?? "";

  return (
    <section className="panel panel-stack" aria-labelledby="chart-h">
      <h3 id="chart-h">{t.chart.heading}</h3>
      <div className="charts">
        <div className="chart-box">
          <span className="label">{t.chart.time}</span>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
              {xAxis}
              <YAxis tick={AXIS_STYLE} />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)} ms`, t.chart.time]}
                labelFormatter={label}
                contentStyle={TOOLTIP_STYLE}
                cursor={TOOLTIP_CURSOR}
              />
              <Bar dataKey="time" radius={[6, 6, 0, 0]} maxBarSize={72}>
                {data.map((d) => <Cell key={d.name} fill={d.success ? CHART.lime : CHART.fail} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <span className="label">{t.chart.attempts}</span>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
              {xAxis}
              <YAxis scale="log" domain={[1, "auto"]} allowDataOverflow tick={AXIS_STYLE} />
              <Tooltip
                formatter={(v: number) => [v.toLocaleString(), t.results.headers.attempts]}
                labelFormatter={label}
                contentStyle={TOOLTIP_STYLE}
                cursor={TOOLTIP_CURSOR}
              />
              <Bar dataKey="attempts" radius={[6, 6, 0, 0]} maxBarSize={72}>
                {data.map((d) => <Cell key={d.name} fill={d.success ? CHART.ink : CHART.fail} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {anyFailed && <p className="hint">{t.chart.failNote}</p>}
    </section>
  );
}
