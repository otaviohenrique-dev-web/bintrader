import { pct } from '../lib/format';

/** Linha de acerto ao longo das validações, com o ponto de empate tracejado. */
export default function TrendChart({ points, breakEven, height = 150 }: { points: { x: string; v: number }[]; breakEven: number; height?: number }) {
  if (points.length < 2) return <div className="empty">A evolução aparece depois de duas validações (a cada ~4 h de mercado).</div>;
  const W = 800;
  const PAD = 10;
  const vals = points.map((p) => p.v);
  const lo = Math.min(...vals, breakEven) - 0.01;
  const hi = Math.max(...vals, breakEven) + 0.01;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => PAD + (height - PAD * 2) * (1 - (v - lo) / (hi - lo));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Acerto por validação" style={{ display: 'block' }}>
        <line x1="0" x2={W} y1={y(breakEven)} y2={y(breakEven)} stroke="var(--text-3)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
        <polyline fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
        <span>{points[0].x} · <b className="mono" style={{ color: 'var(--text-2)' }}>{pct(points[0].v)}</b></span>
        <span style={{ color: 'var(--text-2)' }}>┄ empate {pct(breakEven)}</span>
        <span>{points[points.length - 1].x} · <b className="mono" style={{ color: 'var(--text-2)' }}>{pct(points[points.length - 1].v)}</b></span>
      </div>
    </div>
  );
}
