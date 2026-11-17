import { useEffect, useRef, useState } from 'react';
import { api, type HourStat, type PlanResponse, type Snapshot } from '../api';
import { brl, brlSigned, int, pct } from '../lib/format';

type Profile = 'conservador' | 'moderado' | 'agressivo';
const PROFILE_TXT: Record<Profile, string> = { conservador: 'Conservador', moderado: 'Moderado', agressivo: 'Agressivo' };
const parse = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

/** Cor da hora: diferença para a média da própria IA; opacidade pela confiança (n). */
function cell(h: HourStat, overall: number) {
  if (h.winRate === null || h.n === 0) return { bg: 'var(--s2)', fg: 'var(--text-3)' };
  const d = (h.winRate - overall) * 100;
  const a = Math.min(1, Math.abs(d) / 4);
  const conf = Math.min(1, h.n / 150);
  const base = d >= 0 ? '37,192,138' : '239,91,103';
  return { bg: `rgba(${base},${(0.1 + a * 0.5) * (0.35 + conf * 0.65)})`, fg: 'var(--text)' };
}

export default function Plan({ snap }: { snap: Snapshot }) {
  const symbol = snap.config.symbol;
  const [data, setData] = useState<PlanResponse | null>(null);
  const [err, setErr] = useState('');
  const [balance, setBalance] = useState('');
  const [profile, setProfile] = useState<Profile>('moderado');
  const [loss, setLoss] = useState('');
  const [gain, setGain] = useState('');
  const first = useRef(true);

  const load = (q: { balance: number; profile: string; stopLoss?: number | null; stopGain?: number | null }, persist: boolean) =>
    api
      .plan(symbol, q)
      .then((d) => {
        setData(d);
        setErr('');
        if (first.current) {
          first.current = false;
          setBalance(String(d.settings.balance).replace('.', ','));
          setProfile(d.settings.profile);
          setLoss(d.settings.stopLossPct ? String(d.settings.stopLossPct) : '');
          setGain(d.settings.stopGainPct ? String(d.settings.stopGainPct) : '');
        }
        if (persist) void api.planSettings({ balance: q.balance, profile: q.profile, stopLossPct: q.stopLoss ?? null, stopGainPct: q.stopGain ?? null });
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    first.current = true;
    void load({ balance: 0, profile: '' }, false); // usa o que foi salvo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // recalcula ao editar (com pequeno atraso)
  useEffect(() => {
    if (first.current) return;
    const b = parse(balance);
    if (!Number.isFinite(b) || b < 1) return;
    const t = setTimeout(() => void load({ balance: b, profile, stopLoss: loss ? parse(loss) : null, stopGain: gain ? parse(gain) : null }, true), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance, profile, loss, gain]);

  const p = data?.plan;
  const nowH = new Date().getHours();

  return (
    <>
      <section className="card">
        <div className="card-h"><h2>Plano de entrada · {snap.config.name}</h2><span className="muted" style={{ fontSize: 12 }}>calculado com os números reais da Aegis IA</span></div>
        <p className="sub" style={{ marginTop: -6 }}>
          Informe o saldo e ela recomenda o valor de cada entrada e os limites do dia, respeitando a estratégia. Só planejamento: nada é enviado a corretora.
        </p>
        <div className="row">
          <label>Saldo atual (R$)
            <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} style={{ width: 150 }} placeholder="1000" />
          </label>
          <label>Perfil de risco
            <div className="seg">
              {(Object.keys(PROFILE_TXT) as Profile[]).map((k) => (
                <button key={k} className={profile === k ? 'on' : ''} onClick={() => setProfile(k)}>{PROFILE_TXT[k]}</button>
              ))}
            </div>
          </label>
          <label>Stop loss (% da banca)
            <input inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value)} style={{ width: 110 }} placeholder={data ? String(data.profiles[profile].loss) : '5'} />
          </label>
          <label>Stop gain (% da banca)
            <input inputMode="decimal" value={gain} onChange={(e) => setGain(e.target.value)} style={{ width: 110 }} placeholder={loss || (data ? String(data.profiles[profile].loss) : '5')} />
          </label>
        </div>
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </section>

      {p && data && (
        <>
          <div className="stat-strip">
            <div>
              <div className="k">Valor por entrada</div>
              <div className="v mono gold">{brl(p.stake)}</div>
              <div className="k" style={{ marginTop: 2 }}>{p.stakePct.toFixed(2).replace('.', ',')}% do saldo · {p.mode === 'validado' ? 'vantagem validada' : 'modo estudo'}</div>
            </div>
            <div><div className="k">Stop loss do dia</div><div className="v mono down">−{brl(p.stopLoss)}</div><div className="k" style={{ marginTop: 2 }}>{p.lossesToStop} derrotas seguidas</div></div>
            <div><div className="k">Stop gain do dia</div><div className="v mono up">+{brl(p.stopGain)}</div><div className="k" style={{ marginTop: 2 }}>parar e sair no verde</div></div>
            <div><div className="k">Esperança por entrada</div><div className={`v mono ${p.evPerTrade >= 0 ? 'up' : 'down'}`}>{brlSigned(p.evPerTrade)}</div><div className="k" style={{ marginTop: 2 }}>acerto {pct(data.reference.winRate)} · empate {pct(p.breakEven)}</div></div>
          </div>

          <div className="two" style={{ marginBottom: 16 }}>
            <section className="card">
              <div className="card-h"><h2>Por que este valor</h2></div>
              <ul className="plain">
                {p.reasons.map((r) => <li key={r}>{r}</li>)}
                {p.warnings.map((w) => <li key={w} className="warn">{w}</li>)}
              </ul>
              <p className="caption">Base de acerto: <b>{data.reference.source}</b> ({int(data.reference.n)} operações, IC {pct(data.reference.ci95[0], 0)}–{pct(data.reference.ci95[1], 0)}), payout atual {pct(data.reference.payoutRatio, 0)}.</p>
            </section>
            <section className="card">
              <div className="card-h"><h2>Um dia típico: ~{p.recommendedOps} entradas</h2></div>
              <p className="sub" style={{ marginTop: -6 }}>Simulação de 4.000 dias com este plano, parando no primeiro stop.</p>
              <SimBars sim={p.sim} />
              <p className="caption">Resultado médio do dia: <b className={`mono ${p.sim.avgResult >= 0 ? 'up' : 'down'}`}>{brlSigned(p.sim.avgResult)}</b>. Stops limitam o tamanho da perda, não mudam a esperança de cada entrada.</p>
            </section>
          </div>

          <section className="card">
            <div className="card-h">
              <h2>Mapa de horários</h2>
              <span className={`status-chip ${data.nowHour.rating === 'forte' ? 'up' : data.nowHour.rating === 'fraco' ? 'down' : ''}`}>
                <i />Agora ({String(nowH).padStart(2, '0')}h): {data.nowHour.rating}{data.nowHour.winRate !== null ? ` · ${pct(data.nowHour.winRate)} (n=${int(data.nowHour.n)})` : ''}
              </span>
            </div>
            <div className="hourmap">
              {data.hours.map((h) => {
                const c = cell(h, data.overall);
                return (
                  <div key={h.hour} className={`hcell ${h.hour === nowH ? 'now' : ''}`} style={{ background: c.bg, color: c.fg }} title={`${h.hour}h · ${h.n} operações${h.winRate !== null ? ` · acerto ${pct(h.winRate)}` : ''}`}>
                    <span>{String(h.hour).padStart(2, '0')}h</span>
                    <b className="mono">{h.winRate !== null && h.n >= 20 ? (h.winRate * 100).toFixed(0) : '—'}</b>
                  </div>
                );
              })}
            </div>
            <p className="caption">Verde: a IA acertou mais nessa hora do que na média ({pct(data.overall)}). Vermelho: menos. Cores fracas = poucas operações. Horário do seu computador ({data.tz}).</p>
          </section>

          <section className="card">
            <div className="card-h"><h2>Melhores janelas e quantas entradas fazer</h2></div>
            {data.windows.length === 0 && <div className="empty">Ainda sem dados suficientes por janela.</div>}
            <div className="windows">
              {data.windows.map((w) => (
                <div className="win" key={w.start}>
                  <div className="win-h">
                    <b className="mono">{w.label}</b>
                    <span className={`pill ${w.significant ? 'good' : 'warn'}`}>{w.significant ? 'significativa' : 'pode ser acaso'}</span>
                  </div>
                  <div className="win-wr mono">{pct(w.winRate)}</div>
                  <div className="k">IC {pct(w.ci95[0], 0)}–{pct(w.ci95[1], 0)} · {int(w.n)} operações</div>
                  <ul className="plain" style={{ marginTop: 10 }}>
                    <li>A IA costuma dar ~<b>{w.opsPerWindow.toFixed(0)}</b> sinais nesta janela.</li>
                    <li>Recomendo no máximo <b>{w.recommendedOps}</b> entradas de <b>{brl(w.stake)}</b>.</li>
                    <li>Pare em <b className="down">−{brl(data.plan.stopLoss)}</b> ou <b className="up">+{brl(data.plan.stopGain)}</b>.</li>
                    <li>Resultado médio na janela: <b className={`mono ${w.sim.avgResult >= 0 ? 'up' : 'down'}`}>{brlSigned(w.sim.avgResult)}</b> · pior caso <b className="mono down">−{brl(w.recommendedOps * w.stake)}</b>.</li>
                  </ul>
                </div>
              ))}
            </div>
            <p className="caption">
              São 24 janelas testadas: diferenças de 1 a 3 pontos percentuais aparecem por puro acaso. Só trate uma janela como "melhor" se ela vier marcada como <b>significativa</b>. Do contrário, é curiosidade.
            </p>
          </section>
        </>
      )}
    </>
  );
}

function SimBars({ sim }: { sim: { pGain: number; pLoss: number; pNeither: number } }) {
  const rows: [string, number, string][] = [
    ['Bater o stop gain', sim.pGain, 'var(--up)'],
    ['Chegar ao stop loss', sim.pLoss, 'var(--down)'],
    ['Terminar sem bater nenhum', sim.pNeither, 'var(--text-3)'],
  ];
  return (
    <div>
      {rows.map(([l, v, c]) => (
        <div key={l} className="simrow">
          <span>{l}</span>
          <div className="w-bar" style={{ height: 8 }}><i style={{ left: 0, width: `${v * 100}%`, background: c }} /></div>
          <b className="mono">{pct(v, 0)}</b>
        </div>
      ))}
    </div>
  );
}
