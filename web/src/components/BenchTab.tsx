import { useEffect, useState } from 'react';
import { api, type Bench, type Snapshot, type Toolbox } from '../api';
import { useNow } from '../hooks/hooks';
import { dayTime, int, pct } from '../lib/format';
import TrendChart from './TrendChart';

const fmtPp = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')} pp`;

const DECISION: Record<string, { text: string; cls: string }> = {
  promovida: { text: 'Nova configuração adotada', cls: 'good' },
  mantida: { text: 'Configuração atual mantida', cls: 'warn' },
  'atual-e-a-melhor': { text: 'A atual já era a melhor', cls: 'warn' },
  'sem-cofre': { text: 'Cofre pequeno, decisão adiada', cls: 'warn' },
  'sem-dados': { text: 'Sem dados suficientes', cls: 'warn' },
};

export default function BenchTab({ snap }: { snap: Snapshot }) {
  const symbol = snap.config.symbol;
  const [bench, setBench] = useState<Bench | null>(null);
  const [box, setBox] = useState<Toolbox | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);

  useEffect(() => {
    api.toolbox().then(setBox).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => api.bench(symbol).then((b) => alive && setBench(b)).catch(() => {});
    void load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol]);

  const run = async () => {
    setBusy(true);
    try {
      await api.benchRun(symbol);
    } finally {
      setTimeout(() => setBusy(false), 1500);
    }
  };

  const last = bench?.history[bench.history.length - 1];
  const exps = bench?.experiments ?? [];
  const shown = all ? exps : exps.slice(0, 10);
  const current = bench?.versions[bench.versions.length - 1];
  const prog = bench && bench.progress.k ? (bench.progress.i / bench.progress.k) * 100 : 0;
  const vals = snap.validations.map((v) => ({ x: dayTime(v.at), v: v.winRate }));
  const be = snap.validations.length ? snap.validations[snap.validations.length - 1].breakEven : snap.breakEven;

  return (
    <>
      <section className="card">
        <div className="card-h"><h2>Caixa de ferramentas</h2><span className="muted" style={{ fontSize: 12 }}>tudo o que a Aegis IA pode usar</span></div>
        <p className="sub" style={{ marginTop: -6 }}>
          Ela mesma escolhe a combinação. Em uso agora neste ativo: <b style={{ color: 'var(--gold-2)' }}>{snap.toolkit.label}</b>.
        </p>
        <div className="rules" style={{ marginBottom: 14 }}>
          <span>Tempos gráficos: {box ? box.timeframes.map((t) => t.label).join(' · ') : '…'}</span>
          <span>Expirações: {box ? box.durations.join(' · ') : '…'} min</span>
          <span>{box ? box.experiments : '…'} combinações possíveis</span>
        </div>
        <div className="toolgrid">
          {(box?.groups ?? []).map((g) => (
            <div className={`tool ${snap.toolkit.groups.includes(g.id) ? 'on' : ''}`} key={g.id}>
              <div className="tool-h"><b>{g.label}</b>{snap.toolkit.groups.includes(g.id) && <span className="status-chip gold"><i />em uso</span>}</div>
              <p>{g.what}</p>
              <ul>{g.tools.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Pesquisa em tempo real</h2>
          <button className="go" onClick={() => void run()} disabled={busy || bench?.running}>{bench?.running ? 'Pesquisando…' : 'Rodar um ciclo agora'}</button>
        </div>
        {bench?.running ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>Hipótese <b className="mono">{bench.progress.i}/{bench.progress.k}</b>: {bench.progress.current}</span>
              <span className="muted mono">{prog.toFixed(0)}%</span>
            </div>
            <div className="bar" style={{ marginTop: 0 }}><i style={{ width: `${prog}%` }} /></div>
          </>
        ) : (
          <p className="sub" style={{ margin: 0 }}>
            {bench?.lastCycleAt
              ? `Último ciclo ${dayTime(bench.lastCycleAt)}${bench.nextCycleAt ? ` · próximo por volta de ${dayTime(Math.max(bench.nextCycleAt, now))}` : ''}.`
              : 'O primeiro ciclo começa logo depois que a IA termina de baixar e validar o histórico.'}
          </p>
        )}
        <div className="how" style={{ marginTop: 16 }}>
          <div><h3>Cofre</h3><p>Os {Math.round((bench?.vault.share ?? 0.3) * 100)}% de dados mais recentes ficam reservados e nunca entram na escolha. Servem para conferir a campeã uma única vez, como uma prova surpresa.</p></div>
          <div><h3>Contra a sorte</h3><p>Testar {bench?.tests ?? '…'} combinações garante que algumas pareçam boas por acaso. Por isso o critério é corrigido: só vale o que passa de α = {bench ? (bench.alpha * 100).toFixed(3).replace('.', ',') : '…'}%.</p></div>
          <div><h3>Troca com prova</h3><p>A configuração só muda, e a versão só sobe, se a candidata passar no cofre com significância e superar a atual. Do contrário, a IA diz por que manteve.</p></div>
        </div>
      </section>

      {last && (
        <section className="card">
          <div className="card-h"><h2>Última decisão</h2><span className={`pill ${DECISION[last.decision]?.cls ?? 'warn'}`}>{DECISION[last.decision]?.text ?? last.decision}</span></div>
          <p style={{ margin: '0 0 10px' }}>{last.note}</p>
          <div className="mini">
            <div><div className="k">Hipóteses testadas</div><div className="v mono">{last.tests}</div></div>
            <div><div className="k">Acima do empate</div><div className="v mono">{last.aboveBreakEven}</div></div>
            <div><div className="k">Passaram do critério corrigido</div><div className={`v mono ${last.significant ? 'up' : ''}`}>{last.significant}</div></div>
            <div><div className="k">Conferências no cofre (total)</div><div className="v mono">{bench?.vault.looks ?? 0}</div></div>
          </div>
          {last.vault && (
            <p className="caption">
              <b>Cofre:</b> {last.vault.challenger.label} fez <b className="mono">{pct(last.vault.challenger.winRate)}</b> em {int(last.vault.challenger.n)} operações
              {last.vault.champion ? <> contra <b className="mono">{pct(last.vault.champion.winRate)}</b> da atual</> : null} (empate {pct(last.vault.challenger.breakEven)}).
              Na bancada ela tinha {last.best ? pct(last.best.winRate) : '—'}: a queda mede quanto da escolha foi sorte.
            </p>
          )}
        </section>
      )}

      <section className="card flush">
        <div className="card-h" style={{ padding: '16px 18px 0' }}>
          <h2>Placar das hipóteses</h2>
          <span className="muted" style={{ fontSize: 12 }}>só dados anteriores ao cofre · walk-forward</span>
        </div>
        {exps.length === 0 ? (
          <div className="empty">Ainda sem resultados. Aparecem aqui conforme a IA testa cada configuração.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Configuração</th><th className="r">Operações</th><th className="r">Acerto</th><th className="r">IC 95%</th><th className="r">Empate</th><th className="r">Margem</th><th>Leitura</th></tr></thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.key} className={bench?.champion.key === e.key ? 'is-champion' : ''}>
                    <td>{e.label}{bench?.champion.key === e.key && <span className="tag" style={{ marginLeft: 8, color: 'var(--gold)', background: 'var(--gold-dim)' }}>EM USO</span>}</td>
                    <td className="r mono">{int(e.n)}</td>
                    <td className="r mono">{pct(e.winRate)}</td>
                    <td className="r mono">{pct(e.ci95[0], 0)}–{pct(e.ci95[1], 0)}</td>
                    <td className="r mono">{pct(e.breakEven)}</td>
                    <td className={`r mono ${e.marginPp >= 0 ? 'up' : 'down'}`}>{fmtPp(e.marginPp)}</td>
                    <td><span className={`pill ${e.significant ? 'good' : e.marginPp > 0 ? 'warn' : 'void'}`}>{e.significant ? 'significativo' : e.marginPp > 0 ? 'pode ser acaso' : 'abaixo'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {exps.length > 10 && (
              <div style={{ padding: 12, textAlign: 'center' }}>
                <button className="btn-link" onClick={() => setAll((v) => !v)}>{all ? 'Mostrar só as 10 melhores' : `Ver as ${exps.length} hipóteses`}</button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Versão e builds</h2>
          <span className="status-chip gold"><i />v{current?.label ?? snap.version.label} · build {int(snap.builds)}</span>
        </div>
        <div className="how" style={{ marginBottom: 16 }}>
          <div><h3>Build</h3><p>Cada retreino (a cada hora de mercado) gera uma nova build: pesos novos com dados novos. É manutenção, <b>não</b> prova de melhora. Já são {int(snap.builds)}.</p></div>
          <div><h3>Versão</h3><p>Só sobe quando a bancada acha uma configuração que passa no cofre. Aí o número cresce de forma exponencial com o ganho de acerto: <b>+1 p.p. = +10%</b> no número ({'v = v₀ · e'}<sup>0,0953 · Δpp</sup>).</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Versão</th><th>Quando</th><th>Configuração</th><th className="r">Acerto</th><th className="r">Evolução</th><th>Motivo</th></tr></thead>
            <tbody>
              {[...(bench?.versions ?? [])].reverse().map((v) => (
                <tr key={`${v.label}-${v.at}`}>
                  <td className="mono"><b>{v.label}</b></td>
                  <td className="mono">{dayTime(v.at)}</td>
                  <td>{v.toolkit}</td>
                  <td className="r mono">{v.winRate === null ? '—' : pct(v.winRate)}</td>
                  <td className="r mono">{v.deltaPp ? fmtPp(v.deltaPp) : '—'}</td>
                  <td><small>{v.note}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ margin: '18px 0 8px', fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Acerto retroativo a cada validação</h3>
        <TrendChart points={vals} breakEven={be} />
        <p className="caption">Esta curva mostra como o acerto medido oscila de uma validação para outra. Pequenas subidas e descidas são ruído, e por isso a versão não muda com elas.</p>
      </section>
    </>
  );
}
