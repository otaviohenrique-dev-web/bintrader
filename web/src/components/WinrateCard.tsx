import { useState } from 'react';
import type { PerfStats, Snapshot } from '../api';
import { useCountUp } from '../hooks/hooks';
import { int, pct, signed } from '../lib/format';

const STATUS: Record<PerfStats['status'], { cls: string; text: string }> = {
  coletando: { cls: 'warn', text: 'Coletando amostra' },
  abaixo: { cls: 'down', text: 'Abaixo do empate' },
  inconclusivo: { cls: 'warn', text: 'Inconclusivo' },
  vantagem: { cls: 'up', text: 'Vantagem confirmada' },
};

const LO = 0.4;
const HI = 0.7;
const pos = (p: number) => `${((Math.min(HI, Math.max(LO, p)) - LO) / (HI - LO)) * 100}%`;

/** Escala 40–70%: ponto = taxa de acerto, faixa = IC 95%, linha tracejada = ponto de empate. */
export function Gauge({ s }: { s: PerfStats }) {
  const lo = Math.min(HI, Math.max(LO, s.ci95[0]));
  const hi = Math.min(HI, Math.max(LO, s.ci95[1]));
  return (
    <div className="gauge" role="img" aria-label={`Acerto ${pct(s.winRate)} contra empate em ${pct(s.breakEven)}`}>
      <div className="gauge-track" />
      {s.n > 0 && (
        <>
          <div className="gauge-ci" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
          <div className="gauge-dot" style={{ left: pos(s.winRate) }} />
        </>
      )}
      <div className="gauge-be" style={{ left: pos(s.breakEven) }}>
        <span>Empate {pct(s.breakEven, 1)}</span>
      </div>
      <div className="gauge-ticks mono">
        <span>40%</span><span>50%</span><span>60%</span><span>70%</span>
      </div>
    </div>
  );
}

export default function WinrateCard({ snap }: { snap: Snapshot }) {
  const { live, retro } = snap.stats;
  const [mode, setMode] = useState<'auto' | 'live' | 'retro'>('auto');
  const eff: 'live' | 'retro' = mode === 'auto' ? (live.n >= 30 || !retro ? 'live' : 'retro') : mode;
  const s = (eff === 'retro' ? retro : live) ?? live;
  const shown = useCountUp(s.winRate * 100);
  const st = STATUS[s.status];

  return (
    <section className="card">
      <div className="card-h">
        <span className="eyebrow">Taxa de acerto da IA</span>
        <div className="seg" role="tablist">
          <button className={eff === 'live' ? 'on' : ''} onClick={() => setMode('live')}>Ao vivo</button>
          <button className={eff === 'retro' ? 'on' : ''} onClick={() => setMode('retro')} disabled={!retro}>Retroativo</button>
        </div>
      </div>

      <div className="wr-big">
        <div className="wr-num mono">
          {s.n ? shown.toFixed(1).replace('.', ',') : '—'}
          {s.n > 0 && <small>%</small>}
        </div>
        <span className={`status-chip ${st.cls}`}><i />{st.text}</span>
      </div>

      <Gauge s={s} />

      <div className="mini">
        <div><div className="k">Operações</div><div className="v mono">{int(s.n)}</div></div>
        <div>
          <div className="k">Resultado (stakes)</div>
          <div className={`v mono ${s.pnl >= 0 ? 'up' : 'down'}`}>{signed(s.pnl, 1)}</div>
        </div>
        <div>
          <div className="k">Últimas {s.last50?.n ?? 0}</div>
          <div className="v mono">{s.last50 ? pct(s.last50.winRate, 0) : '—'}</div>
        </div>
        <div>
          <div className="k">Sequência</div>
          <div className={`v mono ${s.streak?.kind === 'W' ? 'up' : 'down'}`}>
            {s.streak ? `${s.streak.len}${s.streak.kind === 'W' ? 'W' : 'L'}` : '—'}
          </div>
        </div>
      </div>

      <p className="caption">
        {eff === 'retro'
          ? `Retroativo: a IA reconstruída em janelas do passado, testada só no futuro, sobre ${int(snap.backtest?.candles ?? 0)} velas. Faixa dourada = intervalo de confiança de 95%.`
          : 'Ao vivo: sinais emitidos e liquidados pelo motor, com o preço real da Deriv. Faixa dourada = intervalo de confiança de 95%.'}
        {eff === 'live' && live.n < 30 && ' Amostra ainda pequena: o número oscila muito.'}
      </p>
    </section>
  );
}
