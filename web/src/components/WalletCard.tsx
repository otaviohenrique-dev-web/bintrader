import { useEffect, useState } from 'react';
import { api, type WalletSummary } from '../api';
import { useCountUp } from '../hooks/hooks';
import { brl, brlSigned, int, pct } from '../lib/format';
import Icon from './Icon';

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="spark-empty">A curva da banca aparece com o primeiro sinal liquidado.</div>;
  const W = 300;
  const H = 56;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 4 - ((v - min) / span) * (H - 8)}`);
  const up = data[data.length - 1] >= data[0];
  const c = up ? 'var(--up)' : 'var(--down)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden style={{ display: 'block' }}>
      <defs>
        <linearGradient id="spk" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.22" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill="url(#spk)" points={`0,${H} ${pts.join(' ')} ${W},${H}`} />
      <polyline fill="none" stroke={c} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" points={pts.join(' ')} />
    </svg>
  );
}

/** Banca fictícia em R$: soma e subtrai conforme os sinais são liquidados. */
export default function WalletCard({ w, onChanged }: { w: WalletSummary; onChanged: () => void }) {
  const [equity, setEquity] = useState<number[]>([]);
  const [edit, setEdit] = useState(false);
  const [mode, setMode] = useState(w.settings.stakeMode);
  const [percent, setPercent] = useState(String(w.settings.stakePercent));
  const [fixed, setFixed] = useState(String(w.settings.stakeFixed));
  const [initial, setInitial] = useState(String(w.initial));
  const [err, setErr] = useState('');
  const shown = useCountUp(w.balance, 800);

  useEffect(() => {
    api.wallet().then((r) => setEquity(r.equity)).catch(() => {});
  }, [w.trades, w.balance]);

  const save = async () => {
    setErr('');
    try {
      await api.walletSettings({ stakeMode: mode, stakePercent: Number(percent.replace(',', '.')), stakeFixed: Number(fixed.replace(',', '.')) });
      onChanged();
      setEdit(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const reset = async () => {
    const v = Number(initial.replace(',', '.'));
    if (!window.confirm(`Reiniciar a banca fictícia em ${brl(v)}? O extrato atual será zerado.`)) return;
    try {
      await api.walletReset(v);
      onChanged();
      setEdit(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const up = w.pnl >= 0;
  return (
    <section className="card wallet">
      <div className="card-h">
        <span className="eyebrow">Banca fictícia · BRL</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="status-chip"><i />Simulação</span>
          <button className="icon-btn" onClick={() => setEdit((v) => !v)} aria-label="Ajustar banca" aria-expanded={edit}><Icon name="gear" size={14} /></button>
        </div>
      </div>

      <div className="wallet-balance mono">{brl(shown)}</div>
      <div className={`wallet-delta mono ${up ? 'up' : 'down'}`}>
        {brlSigned(w.pnl)} <span>({w.roi >= 0 ? '+' : '−'}{pct(Math.abs(w.roi), 2)})</span>
        <small className="muted"> desde o início</small>
      </div>

      <Spark data={equity} />

      <div className="mini" style={{ marginTop: 14 }}>
        <div><div className="k">Hoje</div><div className={`v mono ${w.today >= 0 ? 'up' : 'down'}`}>{brlSigned(w.today)}</div></div>
        <div><div className="k">Valor por sinal</div><div className="v mono">{brl(w.stake)}</div></div>
        <div><div className="k">Sinais pagos</div><div className="v mono">{int(w.trades)} <small>{w.wins}W · {w.losses}L</small></div></div>
        <div><div className="k">Maior queda</div><div className="v mono">{pct(w.maxDrawdown, 1)}</div></div>
      </div>

      {w.broke && <p className="caption down">Banca zerada: os sinais continuam, mas sem valor. Reinicie nos ajustes.</p>}

      {edit && (
        <div className="wallet-edit">
          <div className="row" style={{ marginBottom: 10 }}>
            <label>Valor por sinal
              <div className="seg">
                <button className={mode === 'percent' ? 'on' : ''} onClick={() => setMode('percent')}>% da banca</button>
                <button className={mode === 'fixed' ? 'on' : ''} onClick={() => setMode('fixed')}>R$ fixo</button>
              </div>
            </label>
            {mode === 'percent' ? (
              <label>% (0,1 a 5)<input inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} style={{ width: 90 }} /></label>
            ) : (
              <label>R$<input inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} style={{ width: 100 }} /></label>
            )}
            <button className="go" onClick={() => void save()}>Salvar</button>
          </div>
          <div className="row" style={{ marginBottom: 0 }}>
            <label>Reiniciar com (R$)<input inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} style={{ width: 120 }} /></label>
            <button className="btn-ghost" style={{ borderStyle: 'solid' }} onClick={() => void reset()}>Reiniciar banca</button>
          </div>
          {err && <p className="err" style={{ margin: '8px 0 0' }}>{err}</p>}
        </div>
      )}

      <p className="caption">Dinheiro de simulação: cada sinal liquidado soma ou subtrai com o preço e o payout reais. Não é saldo de corretora.</p>
    </section>
  );
}
