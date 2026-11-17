import { useState } from 'react';
import { api, type ResearchResult, type Summary } from '../api';
import EquityChart from './EquityChart';

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

const VERDICT = {
  APTO_PARA_DEMO: { cls: 'good', text: 'APTO PARA CONTA DEMO — passou no gate estatístico' },
  PROMISSOR_INSUFICIENTE: { cls: 'warn', text: 'PROMISSOR, MAS INSUFICIENTE — ainda pode ser sorte' },
  SEM_EDGE: { cls: 'bad', text: 'SEM EDGE — não opere este ativo/configuração' },
} as const;

function Stats({ s }: { s: Summary }) {
  return (
    <div className="grid">
      <div className="stat"><div className="l">Operações (OOS)</div><div className="v">{s.trades}</div></div>
      <div className="stat"><div className="l">Win rate</div><div className="v">{pct(s.winRate)}</div></div>
      <div className="stat"><div className="l">IC 95% (Wilson)</div><div className="v">{pct(s.ci95[0])} – {pct(s.ci95[1])}</div></div>
      <div className="stat"><div className="l">Empate exige</div><div className="v">{pct(s.breakEven)}</div></div>
      <div className="stat"><div className="l">p-valor (α={s.alpha.toFixed(3)})</div><div className={`v ${s.pValue < s.alpha ? 'good' : 'bad'}`}>{s.pValue.toFixed(3)}</div></div>
      <div className="stat"><div className="l">Lucro (em stakes)</div><div className={`v ${s.totalPnl > 0 ? 'good' : 'bad'}`}>{s.totalPnl.toFixed(1)}</div></div>
      <div className="stat"><div className="l">Drawdown máx.</div><div className="v">{s.maxDrawdown.toFixed(1)}</div></div>
      <div className="stat"><div className="l">Trades p/ confirmar</div><div className="v">{s.tradesNeeded?.toLocaleString('pt-BR') ?? '—'}</div></div>
    </div>
  );
}

export default function AegisTab() {
  const [symbol, setSymbol] = useState('frxEURUSD');
  const [granularity, setGranularity] = useState(300);
  const [durationMin, setDurationMin] = useState(15);
  const [threshold, setThreshold] = useState(0.03);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [r, setR] = useState<ResearchResult | null>(null);

  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      setR(await api.research({ symbol, granularity, durationMin, threshold }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const v = r ? VERDICT[r.real.summary.verdict] : null;

  return (
    <>
      <div className="card">
        <h2>AegisAI Alpha — estudo walk-forward</h2>
        <p className="sub">
          Baixa o histórico real, treina em janelas passadas e testa só no futuro (com purga). Em seguida roda o
          mesmo pipeline em passeio aleatório (placebo): se o placebo "ganhar", o resultado real não vale nada.
        </p>
        <div className="row">
          <label>Símbolo (Deriv)<input value={symbol} onChange={(e) => setSymbol(e.target.value)} /></label>
          <label>Vela
            <select value={granularity} onChange={(e) => setGranularity(Number(e.target.value))}>
              <option value={60}>1 min</option><option value={300}>5 min</option><option value={900}>15 min</option>
            </select>
          </label>
          <label>Expiração (min)<input type="number" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} style={{ width: 90 }} /></label>
          <label>Seletividade (|p−0,5| ≥)<input type="number" step="0.01" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: 90 }} /></label>
          <button className="go" onClick={run} disabled={busy}>{busy ? 'Treinando…' : 'Rodar estudo'}</button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>

      {r && v && (
        <>
          <div className={`verdict ${v.cls}`}>{v.text}</div>
          <div className="card">
            <h2>Resultado real fora da amostra</h2>
            <p className="sub">
              {r.candles.toLocaleString('pt-BR')} velas · horizonte {r.horizon} velas · payout {pct(r.payoutRatio)}
              {r.payoutAssumed && <span className="warn"> (assumido — a Deriv não cotou esta duração)</span>} · {r.real.folds} janelas ·
              estudo nº {r.trials} (α corrigido por Bonferroni = {r.alpha.toFixed(4)})
            </p>
            <Stats s={r.real.summary} />
            <EquityChart
              series={[
                { label: 'Real', data: r.real.summary.equity, color: '#4f9cf9' },
                { label: 'Placebo (aleatório)', data: r.placebo.summary.equity, color: '#8b98a8' },
              ]}
            />
          </div>
          <div className="card">
            <h2>Placebo — passeio aleatório, mesmo pipeline</h2>
            <p className="sub">Deve ficar ≈ 50% e SEM EDGE. Se não ficar, há vazamento de dados no código.</p>
            <Stats s={r.placebo.summary} />
          </div>
          <div className="card">
            <h2>O que o modelo aprendeu (pesos padronizados)</h2>
            <table>
              <tbody>
                {[...r.real.weights].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).map((w) => (
                  <tr key={w.feature}><td>{w.feature}</td><td className={w.weight >= 0 ? 'good' : 'bad'}>{w.weight.toFixed(3)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
