export default function EquityChart({
  series,
  height = 160,
}: {
  series: { label: string; data: number[]; color: string }[];
  height?: number;
}) {
  const W = 800;
  const all = series.flatMap((s) => s.data);
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all);
  const span = max - min || 1;
  const maxLen = Math.max(...series.map((s) => s.data.length), 2);
  const x = (i: number) => (i / (maxLen - 1)) * W;
  const y = (v: number) => height - ((v - min) / span) * height;

  return (
    <svg viewBox={`0 0 ${W} ${height + 18}`} width="100%" role="img" aria-label="Curva de capital">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#2a313c" strokeDasharray="4 4" />
      {series.map((s) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={s.color}
          strokeWidth="1.8"
          points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
        />
      ))}
      {series.map((s, i) => (
        <text key={s.label} x={8 + i * 150} y={height + 14} style={{ fill: s.color }}>
          ● {s.label}
        </text>
      ))}
    </svg>
  );
}
