import { useEffect, useState } from 'react';
import { api, type PlanResponse, type Snapshot } from '../api';
import { brl, pct } from '../lib/format';
import type { Tab } from '../lib/tabs';

const RATING = { forte: 'hora forte', neutro: 'hora neutra', fraco: 'hora fraca', 'sem dados': 'sem dados' } as const;

/**
 * Faixa no topo do Painel: melhores janelas de horário, se AGORA é uma delas
 * e quantas entradas fazer. O detalhe completo está na aba Plano.
 */
export default function PlanStrip({ snap, onNavigate }: { snap: Snapshot; onNavigate: (t: Tab) => void }) {
  const [d, setD] = useState<PlanResponse | null>(null);
  const symbol = snap.config.symbol;

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.plan(symbol, { balance: 0, profile: '' }).then((r) => alive && setD(r)).catch(() => {});
    void load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol, snap.wallet.trades]);

  if (!d || d.windows.length === 0) return null;

  const nowH = new Date().getHours();
  const inside = d.windows.find((w) => (nowH - w.start + 24) % 24 < w.width);
  const next = [...d.windows].sort((a, b) => ((a.start - nowH + 24) % 24) - ((b.start - nowH + 24) % 24))[0];
  const hoursTo = (next.start - nowH + 24) % 24;
  const ref = inside ?? d.windows[0];
  const anySig = d.windows.some((w) => w.significant);

  return (
    <section className="card planstrip">
      <div className="ps-block">
        <span className="eyebrow">Plano de hoje</span>
        <div className="ps-now">
          {inside ? (
            <>
              <span className="status-chip gold"><i />Agora: janela de melhor acerto passado</span>
              <span>{inside.label} · {pct(inside.winRate)}</span>
            </>
          ) : (
            <>
              <span className="status-chip"><i />Fora das melhores janelas</span>
              <span>Próxima: {next.label}{hoursTo > 0 ? ` (em ${hoursTo} h)` : ''}</span>
            </>
          )}
        </div>
      </div>

      <div className="ps-block">
        <span className="eyebrow">Melhores horários</span>
        <div className="ps-chips">
          {d.windows.map((w) => (
            <span key={w.start} className={`ps-chip ${inside?.start === w.start ? 'now' : ''}`} title={`${w.n} operações · IC ${pct(w.ci95[0], 0)}–${pct(w.ci95[1], 0)}${w.significant ? '' : ' · pode ser acaso'}`}>
              {w.label} <b className="mono">{pct(w.winRate, 1)}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="ps-block">
        <span className="eyebrow">{inside ? 'Entradas nesta janela' : 'Entradas por janela'}</span>
        <div className="ps-rec">
          <b className="mono">até {ref.recommendedOps}</b> de <b className="mono">{brl(ref.stake)}</b>
          <span className="muted"> · pare em <span className="down">−{brl(d.plan.stopLoss)}</span> ou <span className="up">+{brl(d.plan.stopGain)}</span></span>
        </div>
      </div>

      <div className="ps-end">
        {!anySig && <span className="muted ps-note">Nenhuma janela é estatisticamente significativa: trate como referência.</span>}
        <button className="btn-link" onClick={() => onNavigate('plan')}>Plano completo →</button>
      </div>
    </section>
  );
}
