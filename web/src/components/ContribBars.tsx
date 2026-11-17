import type { Explain } from '../api';
import { pct } from '../lib/format';

const f2 = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')}`;

/**
 * "Por que esta leitura?": a contribuição de cada variável para a probabilidade.
 * Verde empurra para alta, vermelho para baixa. A soma + o viés é a conta inteira do modelo.
 */
export default function ContribBars({ explain, limit = 7, compact = false }: { explain: Explain | null; limit?: number; compact?: boolean }) {
  if (!explain) return <div className="empty">A IA ainda não fez a primeira leitura.</div>;
  const items = explain.items.slice(0, limit);
  const max = Math.max(0.0001, ...items.map((i) => Math.abs(i.contribution)));
  const rest = explain.items.slice(limit).reduce((s, i) => s + i.contribution, 0);
  return (
    <div>
      {!compact && (
        <div className="contrib-head">
          <span>Probabilidade de alta</span>
          <b className="mono">{pct(explain.prob, 1)}</b>
        </div>
      )}
      {items.map((i) => (
        <div className="w-row" key={i.feature} style={{ gridTemplateColumns: '120px 1fr 52px' }}>
          <span title={`valor padronizado ${i.z.toFixed(2)}`}>{i.feature}</span>
          <div className="w-bar">
            <i
              style={{
                background: i.contribution >= 0 ? 'var(--up)' : 'var(--down)',
                width: `${(Math.abs(i.contribution) / max) * 50}%`,
                left: i.contribution >= 0 ? '50%' : undefined,
                right: i.contribution < 0 ? '50%' : undefined,
              }}
            />
          </div>
          <span className="mono" style={{ textAlign: 'right' }}>{f2(i.contribution)}</span>
        </div>
      ))}
      {!compact && (
        <div className="w-row" style={{ gridTemplateColumns: '120px 1fr 52px', color: 'var(--text-3)' }}>
          <span>demais + viés</span>
          <span />
          <span className="mono" style={{ textAlign: 'right' }}>{f2(rest + explain.bias)}</span>
        </div>
      )}
    </div>
  );
}
