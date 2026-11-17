import type { Signal } from '../api';
import { dayTime, pct, price, sideLabel, signed } from '../lib/format';
import Icon from './Icon';

export default function SignalList({ signals, limit = 8 }: { signals: Signal[]; limit?: number }) {
  const rows = [...signals].reverse().slice(0, limit);
  if (rows.length === 0) {
    return <div className="empty">Nenhum sinal emitido ainda. Quando a leitura passar do limiar, ele aparece aqui e no gráfico.</div>;
  }
  return (
    <div>
      {rows.map((s) => (
        <div className="sig-row" key={s.id}>
          <div className={`ic ${s.side === 'CALL' ? 'up' : 'down'}`}>
            <span className={s.side === 'CALL' ? 'up' : 'down'}><Icon name={s.side === 'CALL' ? 'up' : 'down'} size={15} /></span>
          </div>
          <div>
            <div className="t1">
              {sideLabel(s.side)} <span className="mono muted">· {pct(s.side === 'CALL' ? s.prob : 1 - s.prob, 1)}</span>
            </div>
            <div className="t2 mono">
              {dayTime(s.issuedAt)} · {price(s.entryPrice)}
              {s.exitPrice ? ` → ${price(s.exitPrice)}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className={`pill ${s.status}`}>
              {s.status === 'win' ? 'WIN' : s.status === 'loss' ? 'LOSS' : s.status === 'open' ? 'ABERTO' : 'ANULADO'}
            </span>
            {s.pnl !== undefined && s.status !== 'void' && (
              <div className={`t2 mono ${s.pnl >= 0 ? 'up' : 'down'}`}>{signed(s.pnl)}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
