import { useEffect, useState } from 'react';
import { api, type MathResult } from '../api';

const pct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;

export default function MathTab() {
  const [ratio, setRatio] = useState(0.827);
  const [winRate, setWinRate] = useState(0.58);
  const [m, setM] = useState<MathResult | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.math(ratio, winRate).then(setM).catch((e) => setErr(e.message));
  }, [ratio, winRate]);

  return (
    <div className="card">
      <h2>Calculadora da matemática</h2>
      <p className="sub">
        Padrão medido hoje: EUR/USD, 15 min, retorno 82,7%. Mude o win rate e veja o que ele realmente vale.
      </p>
      <div className="row">
        <label>
          Retorno líquido (payout − 1)
          <input type="number" step="0.01" value={ratio} onChange={(e) => setRatio(Number(e.target.value))} />
        </label>
        <label>
          Win rate da IA
          <input type="number" step="0.005" value={winRate} onChange={(e) => setWinRate(Number(e.target.value))} />
        </label>
      </div>
      {err && <p className="err">{err}</p>}
      {m && (
        <div className="grid">
          <div className="stat"><div className="l">Win rate para empatar</div><div className="v">{pct(m.breakEven)}</div></div>
          <div className="stat"><div className="l">"Pedágio" da casa</div><div className="v bad">{(m.houseEdge * 100).toFixed(2)} p.p.</div></div>
          <div className="stat"><div className="l">Esperança por $1 apostado</div><div className={`v ${m.evPerUnit > 0 ? 'good' : 'bad'}`}>{m.evPerUnit.toFixed(3)}</div></div>
          <div className="stat"><div className="l">Kelly (teto absoluto)</div><div className="v">{pct(m.kelly)}</div></div>
          <div className="stat"><div className="l">Trades p/ confirmar essa vantagem</div><div className="v warn">{Number.isFinite(m.tradesToConfirm) ? m.tradesToConfirm.toLocaleString('pt-BR') : '∞'}</div></div>
          <div className="stat"><div className="l">Maior sequência de derrotas (500 trades)</div><div className="v">{m.longestLossStreak500.toFixed(1)}</div></div>
        </div>
      )}
      <p><small>
        Regra do projeto: stake ≤ 1% da banca de estudo e no máximo 1/4 do Kelly. Se a "vantagem" some quando
        n cresce, era sorte.
      </small></p>
    </div>
  );
}
