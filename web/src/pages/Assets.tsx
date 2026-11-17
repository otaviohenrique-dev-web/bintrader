import { useEffect, useMemo, useState } from 'react';
import { api, type CatalogRow, type CatalogState, type WatchItem } from '../api';
import Icon from '../components/Icon';
import { dayTime, int, pct } from '../lib/format';

const MARKET_LABEL: Record<string, string> = { forex: 'Forex', indices: 'Índices OTC', commodities: 'Metais', cryptocurrency: 'Cripto' };

interface Props {
  watch: WatchItem[];
  maxWatch: number;
  onAdd: (symbol: string, select?: boolean) => Promise<void>;
  onRemove: (symbol: string) => Promise<void>;
}

export default function Assets({ watch, maxWatch, onAdd, onRemove }: Props) {
  const [cat, setCat] = useState<CatalogState | null>(null);
  const [err, setErr] = useState('');
  const [market, setMarket] = useState<'all' | 'forex' | 'indices' | 'commodities'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'score' | 'payout'>('score');
  const [showOut, setShowOut] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.catalog().then((c) => alive && setCat(c)).catch((e) => alive && setErr(e.message));
    void load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const have = new Set(watch.map((w) => w.symbol));
  const ok = useMemo(() => (cat?.rows ?? []).filter((r) => r.compatible), [cat]);
  const out = useMemo(() => (cat?.rows ?? []).filter((r) => !r.compatible), [cat]);

  const shown = useMemo(() => {
    const f = ok.filter((r) => (market === 'all' || r.market === market) && (r.name + r.symbol).toLowerCase().includes(q.toLowerCase()));
    return [...f].sort((a, b) => (sort === 'payout' ? (b.payoutRatio ?? 0) - (a.payoutRatio ?? 0) : b.score - a.score));
  }, [ok, market, q, sort]);

  const act = async (fn: () => Promise<void>, key: string) => {
    setBusy(key);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addTop = () =>
    act(async () => {
      const free = maxWatch - watch.length;
      const picks = ok.filter((r) => !have.has(r.symbol) && !r.isOtc).slice(0, Math.min(3, free));
      for (const p of picks) await onAdd(p.symbol, false);
    }, 'top');

  const scanning = cat?.scanning ?? true;

  return (
    <>
      <section className="card">
        <div className="card-h">
          <div>
            <h2>Ativos compatíveis com a Aegis IA</h2>
            <p className="sub" style={{ margin: '2px 0 0' }}>
              {cat?.at
                ? `${int(ok.length)} compatíveis de ${int(ok.length + out.length)} analisados · varredura ${dayTime(cat.at)}`
                : 'Varrendo a Deriv…'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-ghost" style={{ borderStyle: 'solid' }} disabled={scanning} onClick={() => void act(async () => { await api.refreshCatalog(); }, 'scan')}>
              {scanning ? 'Varrendo…' : 'Atualizar varredura'}
            </button>
            <button className="go" disabled={busy === 'top' || watch.length >= maxWatch || ok.length === 0} onClick={() => void addTop()}>
              Monitorar os 3 melhores
            </button>
          </div>
        </div>
        <div className="rules">
          <span>Rise/Fall de {cat?.compat.durationMin ?? 15} min</span>
          <span>Velas M{(cat?.compat.granularity ?? 300) / 60}</span>
          <span>Payout ≥ {pct(cat?.compat.minPayout ?? 0.65, 0)}</span>
          <span>Histórico ≥ {int(cat?.compat.minCandles ?? 1800)} velas</span>
          <span>Sem índices sintéticos (são sorteio)</span>
        </div>
        {err && <p className="err" style={{ margin: '10px 0 0' }}>{err}</p>}
      </section>

      <div className="filters">
        <div className="seg">
          {([['all', 'Todos'], ['forex', 'Forex'], ['indices', 'Índices OTC'], ['commodities', 'Metais']] as const).map(([k, l]) => (
            <button key={k} className={market === k ? 'on' : ''} onClick={() => setMarket(k)}>{l}</button>
          ))}
        </div>
        <div className="seg">
          <button className={sort === 'score' ? 'on' : ''} onClick={() => setSort('score')}>Melhor nota</button>
          <button className={sort === 'payout' ? 'on' : ''} onClick={() => setSort('payout')}>Maior payout</button>
        </div>
        <input placeholder="Buscar ativo" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 180 }} />
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>Monitorando {watch.length} de {maxWatch}</span>
      </div>

      <section className="card flush">
        {scanning && ok.length === 0 ? (
          <div className="boot" style={{ minHeight: 220 }}><div><div className="spin" /><div className="muted">Analisando payout, histórico e estrutura de cada ativo. Leva cerca de 1 minuto.</div></div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nota</th><th>Ativo</th><th>Mercado</th><th className="r">Payout</th><th className="r">Empate exige</th><th>Estrutura</th><th>Observações</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((r) => <Row key={r.symbol} r={r} on={have.has(r.symbol)} full={!have.has(r.symbol) && watch.length >= maxWatch}
                  busy={busy === r.symbol}
                  onAdd={() => void act(() => onAdd(r.symbol, false), r.symbol)}
                  onRemove={() => void act(() => onRemove(r.symbol), r.symbol)} />)}
              </tbody>
            </table>
            {shown.length === 0 && <div className="empty">Nenhum ativo com esses filtros.</div>}
          </div>
        )}
      </section>

      {out.length > 0 && (
        <section className="card">
          <button className="btn-link" onClick={() => setShowOut((v) => !v)} aria-expanded={showOut}>
            {showOut ? 'Ocultar' : 'Ver'} {out.length} descartados e por quê
          </button>
          {showOut && (
            <ul className="timeline" style={{ marginTop: 12 }}>
              {out.map((r) => (
                <li key={r.symbol}><span className="ev" /><span><b>{r.name}</b> <small>{r.symbol}</small><br /><small>{r.reasons.join(' · ')}</small></span><time>{MARKET_LABEL[r.market] ?? r.market}</time></li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function Row({ r, on, full, busy, onAdd, onRemove }: { r: CatalogRow; on: boolean; full: boolean; busy: boolean; onAdd: () => void; onRemove: () => void }) {
  const m = r.metrics;
  return (
    <tr>
      <td><span className={`pill ${r.score >= 60 ? 'good' : r.score >= 40 ? 'warn' : 'bad'}`}>{r.score}</span></td>
      <td>
        <div style={{ fontWeight: 500 }}>{r.name} {r.isOtc && <span className="tag">OTC</span>}</div>
        <small className="mono">{r.symbol}{!r.open && ' · fechado'}</small>
      </td>
      <td>{MARKET_LABEL[r.market] ?? r.market}</td>
      <td className="r mono">{r.payoutRatio !== null ? pct(r.payoutRatio, 1) : '—'}</td>
      <td className="r mono">{r.breakEven !== null ? pct(r.breakEven, 1) : '—'}</td>
      <td className="mono">{m ? <>VR {m.vr.toFixed(2).replace('.', ',')} <small>(z {m.vrZ.toFixed(1).replace('.', ',')})</small></> : '—'}</td>
      <td><small>{r.notes.join(' · ') || '—'}</small></td>
      <td className="r">
        {on ? (
          <button className="btn-ghost" style={{ borderStyle: 'solid', color: 'var(--up)' }} disabled={busy} onClick={onRemove} title="Parar de monitorar"><Icon name="check" size={13} /> Monitorando</button>
        ) : (
          <button className="btn-ghost" style={{ borderStyle: 'solid' }} disabled={busy || full} onClick={onAdd} title={full ? 'Limite de ativos atingido' : 'Baixar histórico e começar a monitorar'}><Icon name="plus" size={13} /> Monitorar</button>
        )}
      </td>
    </tr>
  );
}
