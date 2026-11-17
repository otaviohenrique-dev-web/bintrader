import { useEffect, useMemo, useState } from 'react';
import { api, type LedgerEntry, type Snapshot } from '../api';
import EquityChart from '../components/EquityChart';
import { brl, brlSigned, dayTime, int, pct, price, sideLabel, signed } from '../lib/format';

interface Row {
  key: string;
  at: number;
  side: 'CALL' | 'PUT';
  conf: number;
  entry?: number;
  exit?: number;
  status: 'open' | 'win' | 'loss' | 'void';
  pnl?: number; // stakes
  money?: number; // R$ (só ao vivo)
}

function Seg<T extends string>({ value, onChange, opts }: { value: T; onChange: (v: T) => void; opts: [T, string][] }) {
  return (
    <div className="seg">
      {opts.map(([k, l]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export default function History({ snap }: { snap: Snapshot }) {
  const [src, setSrc] = useState<'live' | 'retro'>('live');
  const [res, setRes] = useState<'all' | 'win' | 'loss'>('all');
  const [side, setSide] = useState<'all' | 'CALL' | 'PUT'>('all');
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [walletEq, setWalletEq] = useState<number[]>([]);
  const g = snap.config.granularity;

  useEffect(() => {
    api.wallet().then((r) => { setLedger(r.ledger); setWalletEq(r.equity); }).catch(() => {});
  }, [snap.wallet.trades, snap.wallet.balance]);

  const byId = useMemo(() => new Map(ledger.map((l) => [l.id, l])), [ledger]);

  const rows: Row[] = useMemo(() => {
    if (src === 'live') {
      return [...snap.signals].reverse().map((s) => ({
        key: s.id, at: s.issuedAt, side: s.side, conf: s.confidence, entry: s.entryPrice, exit: s.exitPrice, status: s.status, pnl: s.pnl,
        money: byId.get(s.id)?.pnl,
      }));
    }
    const ratio = snap.backtest?.payoutRatio ?? 0.85;
    return [...(snap.backtest?.trades ?? [])].reverse().map((t) => ({
      key: `r${t.time}`, at: t.time + g, side: t.side, conf: Math.abs(t.prob - 0.5),
      status: t.win ? 'win' : 'loss', pnl: t.win ? ratio : -1,
    }));
  }, [snap, src, g, byId]);

  const filtered = rows.filter((r) => (res === 'all' || r.status === res) && (side === 'all' || r.side === side));
  const stats = src === 'live' ? snap.stats.live : snap.stats.retro;
  const w = snap.wallet;

  const equity = useMemo(() => {
    if (src === 'retro') return snap.backtest?.equity ?? [];
    return walletEq;
  }, [snap, src, walletEq]);

  return (
    <>
      <div className="filters">
        <span><span className="lbl">Fonte</span><Seg value={src} onChange={setSrc} opts={[['live', 'Ao vivo'], ['retro', 'Retroativo']]} /></span>
        <span><span className="lbl">Resultado</span><Seg value={res} onChange={setRes} opts={[['all', 'Todos'], ['win', 'Ganhos'], ['loss', 'Perdas']]} /></span>
        <span><span className="lbl">Direção</span><Seg value={side} onChange={setSide} opts={[['all', 'Todas'], ['CALL', 'Alta'], ['PUT', 'Baixa']]} /></span>
      </div>

      {stats && (
        <div className="stat-strip">
          <div><div className="k">Operações</div><div className="v mono">{int(stats.n)}</div></div>
          <div><div className="k">Taxa de acerto</div><div className="v mono">{stats.n ? pct(stats.winRate) : '—'}</div></div>
          <div><div className="k">Empate exige</div><div className="v mono">{pct(stats.breakEven)}</div></div>
          {src === 'live' ? (
            <div><div className="k">Banca fictícia</div><div className={`v mono ${w.pnl >= 0 ? 'up' : 'down'}`}>{brl(w.balance)}</div></div>
          ) : (
            <div><div className="k">Resultado (stakes)</div><div className={`v mono ${stats.pnl >= 0 ? 'up' : 'down'}`}>{signed(stats.pnl, 1)}</div></div>
          )}
          <div><div className="k">IC 95%</div><div className="v mono">{stats.n ? `${pct(stats.ci95[0], 0)}–${pct(stats.ci95[1], 0)}` : '—'}</div></div>
        </div>
      )}

      <section className="card">
        <div className="card-h">
          <h2>{src === 'live' ? 'Evolução da banca' : 'Curva de resultado'}</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            {src === 'live' ? `Banca fictícia · parte de ${brl(w.initial)}` : 'Walk-forward (fora da amostra) · em stakes'}
          </span>
        </div>
        {equity.length > 1 ? (
          <EquityChart series={[{ label: src === 'live' ? 'Banca (R$)' : 'Retroativo', data: equity, color: '#d6b36a' }]} />
        ) : (
          <div className="empty">A curva aparece quando houver sinais liquidados.</div>
        )}
      </section>

      <section className="card flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sinal em</th><th>Direção</th><th className="r">Confiança</th>
                <th className="r">Entrada</th><th className="r">Saída</th><th>Resultado</th>
                <th className="r">{src === 'live' ? 'R$' : 'Stakes'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r) => {
                const val = src === 'live' ? r.money : r.pnl;
                return (
                  <tr key={r.key}>
                    <td className="mono">{dayTime(r.at)}</td>
                    <td><span className={r.side === 'CALL' ? 'up' : 'down'}>{sideLabel(r.side)}</span></td>
                    <td className="r mono">{(r.conf * 100).toFixed(1).replace('.', ',')} pp</td>
                    <td className="r mono">{r.entry ? price(r.entry) : '—'}</td>
                    <td className="r mono">{r.exit ? price(r.exit) : '—'}</td>
                    <td><span className={`pill ${r.status}`}>{r.status === 'win' ? 'WIN' : r.status === 'loss' ? 'LOSS' : r.status === 'open' ? 'ABERTO' : 'ANULADO'}</span></td>
                    <td className={`r mono ${(val ?? 0) >= 0 ? 'up' : 'down'}`}>
                      {val === undefined || r.status === 'open' ? '—' : src === 'live' ? brlSigned(val) : signed(val)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty">Nada para mostrar com esses filtros.</div>}
          {filtered.length > 200 && <div className="empty">Mostrando os 200 mais recentes de {int(filtered.length)}.</div>}
        </div>
      </section>
    </>
  );
}
