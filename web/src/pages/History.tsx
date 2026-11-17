import { useEffect, useMemo, useState } from 'react';
import { api, type LedgerEntry, type NamedSignal, type Snapshot } from '../api';
import EquityChart from '../components/EquityChart';
import { brl, brlSigned, dayTime, int, pct, price, sideLabel, signed } from '../lib/format';

interface Row {
  key: string;
  at: number;
  pair: string;
  code: string;
  side: 'CALL' | 'PUT';
  conf: number;
  entry?: number;
  exit?: number;
  status: 'open' | 'win' | 'loss' | 'void';
  pnl?: number; // stakes
  money?: number; // R$ (só ao vivo)
  /** aberto num par que não está mais monitorado: o resultado só sai se voltar a monitorar */
  pending?: boolean;
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

/** Intervalo de Wilson (95%) para uma proporção. */
function wilson(w: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = w / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

export default function History({ snap }: { snap: Snapshot }) {
  const [src, setSrc] = useState<'live' | 'retro'>('live');
  const [res, setRes] = useState<'all' | 'win' | 'loss'>('all');
  const [side, setSide] = useState<'all' | 'CALL' | 'PUT'>('all');
  const [asset, setAsset] = useState<string>('all');
  const [signals, setSignals] = useState<NamedSignal[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [walletEq, setWalletEq] = useState<number[]>([]);
  const g = snap.config.granularity;

  useEffect(() => {
    api.wallet().then((r) => { setLedger(r.ledger); setWalletEq(r.equity); }).catch(() => {});
    api.signals().then(setSignals).catch(() => {});
  }, [snap.wallet.trades, snap.wallet.balance, snap.signals.length]);

  const byId = useMemo(() => new Map(ledger.map((l) => [l.id, l])), [ledger]);
  const pairs = useMemo(() => [...new Set(signals.map((s) => s.name))], [signals]);

  const rows: Row[] = useMemo(() => {
    if (src === 'live') {
      return signals.map((s) => ({
        key: s.id, at: s.issuedAt, pair: s.name, code: s.symbol.replace(/^frx/, ''), side: s.side, conf: s.confidence,
        entry: s.entryPrice, exit: s.exitPrice, status: s.status, pnl: s.pnl, money: byId.get(s.id)?.pnl,
        pending: s.status === 'open' && !s.monitored,
      }));
    }
    const ratio = snap.backtest?.payoutRatio ?? 0.85;
    return [...(snap.backtest?.trades ?? [])].reverse().map((t) => ({
      key: `r${t.time}`, at: t.time + g, pair: snap.config.name, code: snap.config.symbol.replace(/^frx/, ''), side: t.side,
      conf: Math.abs(t.prob - 0.5), status: t.win ? 'win' : 'loss', pnl: t.win ? ratio : -1,
    }));
  }, [snap, src, g, byId, signals]);

  const filtered = rows.filter(
    (r) => (res === 'all' || r.status === res) && (side === 'all' || r.side === side) && (src === 'retro' || asset === 'all' || r.pair === asset),
  );

  // estatísticas do que está na tela (todos os pares, ou o par escolhido)
  const view = useMemo(() => {
    const done = filtered.filter((r) => r.status === 'win' || r.status === 'loss');
    const wins = done.filter((r) => r.status === 'win').length;
    const n = done.length;
    const ci = wilson(wins, n);
    const money = done.reduce((s, r) => s + (r.money ?? 0), 0);
    const stakes = done.reduce((s, r) => s + (r.pnl ?? 0), 0);
    const ratios = signals.filter((s) => s.status === 'win' || s.status === 'loss');
    const avgRatio = ratios.length ? ratios.reduce((a, s) => a + s.payoutRatio, 0) / ratios.length : snap.payoutRatio ?? 0.85;
    return { n, wins, winRate: n ? wins / n : 0, ci, money, stakes, breakEven: src === 'retro' ? snap.breakEven : 1 / (1 + avgRatio) };
  }, [filtered, signals, snap, src]);

  const w = snap.wallet;

  const equity = useMemo(() => {
    if (src === 'retro') return snap.backtest?.equity ?? [];
    if (asset === 'all') return walletEq;
    let e = 0;
    return [0, ...ledger.filter((l) => l.name === asset).map((l) => (e += l.pnl))];
  }, [snap, src, walletEq, asset, ledger]);

  const shownRows = filtered.slice(0, 200);

  return (
    <>
      <div className="filters">
        <span><span className="lbl">Fonte</span><Seg value={src} onChange={setSrc} opts={[['live', 'Ao vivo'], ['retro', 'Retroativo']]} /></span>
        {src === 'live' && pairs.length > 1 && (
          <span>
            <span className="lbl">Par</span>
            <div className="seg">
              <button className={asset === 'all' ? 'on' : ''} onClick={() => setAsset('all')}>Todos</button>
              {pairs.map((p) => <button key={p} className={asset === p ? 'on' : ''} onClick={() => setAsset(p)}>{p}</button>)}
            </div>
          </span>
        )}
        <span><span className="lbl">Resultado</span><Seg value={res} onChange={setRes} opts={[['all', 'Todos'], ['win', 'Ganhos'], ['loss', 'Perdas']]} /></span>
        <span><span className="lbl">Direção</span><Seg value={side} onChange={setSide} opts={[['all', 'Todas'], ['CALL', 'Alta'], ['PUT', 'Baixa']]} /></span>
      </div>

      <div className="stat-strip">
        <div><div className="k">Operações</div><div className="v mono">{int(view.n)}</div></div>
        <div><div className="k">Taxa de acerto</div><div className="v mono">{view.n ? pct(view.winRate) : '—'}</div></div>
        <div><div className="k">Empate exige</div><div className="v mono">{pct(view.breakEven)}</div></div>
        {src === 'live' ? (
          <div><div className="k">Resultado em R$</div><div className={`v mono ${view.money >= 0 ? 'up' : 'down'}`}>{brlSigned(view.money)}</div></div>
        ) : (
          <div><div className="k">Resultado (stakes)</div><div className={`v mono ${view.stakes >= 0 ? 'up' : 'down'}`}>{signed(view.stakes, 1)}</div></div>
        )}
        <div><div className="k">IC 95%</div><div className="v mono">{view.n ? `${pct(view.ci[0], 0)}–${pct(view.ci[1], 0)}` : '—'}</div></div>
      </div>

      <section className="card">
        <div className="card-h">
          <h2>{src === 'live' ? (asset === 'all' ? 'Evolução da banca' : `Resultado em ${asset}`) : 'Curva de resultado'}</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            {src === 'live' ? `Banca fictícia · parte de ${brl(w.initial)}` : `Walk-forward (fora da amostra) · em stakes · ${snap.config.name}`}
          </span>
        </div>
        {equity.length > 1 ? (
          <EquityChart series={[{ label: src === 'live' ? (asset === 'all' ? 'Banca (R$)' : `${asset} (R$)`) : 'Retroativo', data: equity, color: '#d6b36a' }]} />
        ) : (
          <div className="empty">A curva aparece quando houver sinais liquidados.</div>
        )}
      </section>

      <section className="card flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sinal em</th><th>Par</th><th>Direção</th><th className="r">Confiança</th>
                <th className="r">Entrada</th><th className="r">Saída</th><th>Resultado</th>
                <th className="r">{src === 'live' ? 'R$' : 'Stakes'}</th>
              </tr>
            </thead>
            <tbody>
              {shownRows.map((r) => {
                const val = src === 'live' ? r.money : r.pnl;
                return (
                  <tr key={r.key}>
                    <td className="mono">{dayTime(r.at)}</td>
                    <td><span className="pair">{r.pair}</span> <small className="mono">{r.code}</small></td>
                    <td><span className={r.side === 'CALL' ? 'up' : 'down'}>{sideLabel(r.side)}</span></td>
                    <td className="r mono">{(r.conf * 100).toFixed(1).replace('.', ',')} pp</td>
                    <td className="r mono">{r.entry ? price(r.entry) : '—'}</td>
                    <td className="r mono">{r.exit ? price(r.exit) : '—'}</td>
                    <td><span className={`pill ${r.pending ? 'void' : r.status}`} title={r.pending ? 'Par não monitorado: o resultado só sai se você voltar a monitorá-lo' : undefined}>{r.status === 'win' ? 'WIN' : r.status === 'loss' ? 'LOSS' : r.pending ? 'PENDENTE' : r.status === 'open' ? 'ABERTO' : 'ANULADO'}</span></td>
                    <td className={`r mono ${(val ?? 0) >= 0 ? 'up' : 'down'}`}>
                      {val === undefined || r.status === 'open' ? '—' : src === 'live' ? brlSigned(val) : signed(val)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty">Nada para mostrar com esses filtros.</div>}
          {filtered.length > 200 && <div className="empty">Mostrando as 200 mais recentes de {int(filtered.length)}.</div>}
        </div>
      </section>
    </>
  );
}
