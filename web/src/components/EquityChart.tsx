/** Curva de capital em SVG puro (altura fixa, largura fluida). Séries em unidades de stake. */
export default function EquityChart({
  series,
  height = 190,
}: {
  series: { label: string; data: number[]; color: string }[];
  height?: number;
}) {
  const W = 1000;
  const PAD = 8;
  const all = series.flatMap((s) => s.data);
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all);
  const span = max - min || 1;
  const maxLen = Math.max(...series.map((s) => s.data.length), 2);
  const x = (i: number) => (i / (maxLen - 1)) * W;
  const y = (v: number) => PAD + (height - PAD * 2) - ((v - min) / span) * (height - PAD * 2);
  const first = series[0];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label="Curva de capital"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id="eqfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={first?.color ?? '#d6b36a'} stopOpacity="0.16" />
            <stop offset="1" stopColor={first?.color ?? '#d6b36a'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#272e3a" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        {first && first.data.length > 1 && (
          <polygon
            fill="url(#eqfill)"
            points={`${x(0)},${y(0)} ${first.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')} ${x(first.data.length - 1)},${y(0)}`}
          />
        )}
        {series.map((s) => (
          <polyline
            key={s.label}
            fill="none"
            stroke={s.color}
            strokeWidth="1.8"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
        {series.map((s) => (
          <span key={s.label} style={{ color: s.color }}>● {s.label}</span>
        ))}
      </div>
    </div>
  );
}
