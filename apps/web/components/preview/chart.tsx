import type { ContentBlock } from "@afterhours/contracts";
import { formatNumber, truncate } from "../../lib/format";

type ChartData = NonNullable<ContentBlock["chart"]>;
const COLORS = ["#0f766e", "#102a43", "#b45309", "#7c3aed"];
const W = 560, H = 260, PAD = { l: 56, r: 16, t: 24, b: 48 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Accessible SVG chart drawn only from the structured product values. No invented numbers. */
export function ChartView({ chart, title }: { chart: ChartData; title: string | null }) {
  const { labels, series, unit, type } = chart;
  const all = series.flatMap((s) => s.values);
  if (labels.length === 0 || all.length === 0) return <p className="muted">This chart has no data.</p>;
  const max = niceMax(Math.max(...all, 0));
  const min = Math.min(...all, 0) < 0 ? -niceMax(-Math.min(...all)) : 0;
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + plotH - ((v - min) / (max - min || 1)) * plotH;
  const band = plotW / labels.length;
  const ticks = [0, 1, 2, 3, 4].map((i) => min + ((max - min) * i) / 4);
  const summary = `${type === "bar" ? "Bar" : "Line"} chart${title ? ` titled ${title}` : ""}${unit ? `, values in ${unit}` : ""}. ${series
    .map((s) => `${s.name}: ${labels.map((l, i) => `${l} ${s.values[i] === undefined ? "no value" : formatNumber(s.values[i]!)}`).join("; ")}`)
    .join(". ")}.`;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">{formatNumber(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={`${l}-${i}`} x={PAD.l + band * i + band / 2} y={H - PAD.b + 18} textAnchor="middle" className="chart-tick">{truncate(l, 14)}</text>
        ))}
        {type === "bar"
          ? series.map((s, si) => {
              const bw = Math.min(56, (band * 0.7) / series.length);
              return s.values.map((v, i) => {
                const x = PAD.l + band * i + band / 2 - (bw * series.length) / 2 + bw * si;
                return (
                  <g key={`${si}-${i}`}>
                    <rect x={x} y={Math.min(y(v), y(0))} width={bw - 2} height={Math.abs(y(v) - y(0))} fill={COLORS[si % COLORS.length]} rx={2} />
                    <text x={x + (bw - 2) / 2} y={Math.min(y(v), y(0)) - 6} textAnchor="middle" className="chart-value">{formatNumber(v)}</text>
                  </g>
                );
              });
            })
          : series.map((s, si) => {
              const pts = s.values.map((v, i) => `${PAD.l + band * i + band / 2},${y(v)}`).join(" ");
              return (
                <g key={si}>
                  <polyline points={pts} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth={2.5} />
                  {s.values.map((v, i) => (
                    <g key={i}>
                      <circle cx={PAD.l + band * i + band / 2} cy={y(v)} r={4} fill={COLORS[si % COLORS.length]} />
                      <text x={PAD.l + band * i + band / 2} y={y(v) - 10} textAnchor="middle" className="chart-value">{formatNumber(v)}</text>
                    </g>
                  ))}
                </g>
              );
            })}
        {unit && <text x={PAD.l} y={12} className="chart-unit">{unit}</text>}
      </svg>
      {series.length > 1 && (
        <ul className="legend">
          {series.map((s, i) => <li key={s.name}><span className="swatch" style={{ background: COLORS[i % COLORS.length] }} />{s.name}</li>)}
        </ul>
      )}
      <details className="chart-data">
        <summary>Chart data{unit ? ` (${unit})` : ""}</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th scope="col">Label</th>{series.map((s) => <th scope="col" key={s.name}>{s.name}</th>)}</tr></thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={`${l}-${i}`}>
                  <th scope="row">{l}</th>
                  {series.map((s) => <td key={s.name}>{s.values[i] === undefined ? "—" : formatNumber(s.values[i]!)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
