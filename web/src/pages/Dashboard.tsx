import { useMemo, useState } from 'react';
import type { Snapshot } from '../api';
import AgentCard from '../components/AgentCard';
import PlanStrip from '../components/PlanStrip';
import PriceChart from '../components/PriceChart';
import ChartReasoning from '../components/ChartReasoning';
import SignalCard from '../components/SignalCard';
import SignalList from '../components/SignalList';
import WalletCard from '../components/WalletCard';
import WinrateCard from '../components/WinrateCard';
import { digitsFor, num, price, signed } from '../lib/format';
import type { Tab } from '../lib/tabs';

export default function Dashboard({
  snap,
  flash,
  onNavigate,
  onReload,
}: {
  snap: Snapshot;
  flash: 'win' | 'loss' | null;
  onNavigate: (tab: Tab) => void;
  onReload: () => void;
}) {
  const [showRetro, setShowRetro] = useState(false);
  const last = snap.candles[snap.candles.length - 1];
  const first24 = snap.candles[Math.max(0, snap.candles.length - 289)];
  const digits = last ? Math.max(digitsFor(last.close), 2) : 5;
  const chg = last && first24 ? ((last.close - first24.open) / first24.open) * 100 : 0;
  const retro = useMemo(() => snap.backtest?.trades ?? [], [snap.backtest]);
  const openSig = snap.signals.find((s) => s.status === 'open');

  return (
    <>
    <PlanStrip snap={snap} onNavigate={onNavigate} />
    <div className="layout">
      <div>
        <section className="card chart-card">
          <div className="chart-head">
            <div className="chart-title">
              <div className="name">
                {snap.config.name}
                <span className="tf">M{snap.config.granularity / 60}</span>
                <span className="tf">expira {snap.config.durationMin} min</span>
              </div>
              <div className="chart-price">
                <span className="px mono">{last ? price(last.close, digits) : '—'}</span>
                <span className={`chg mono ${chg >= 0 ? 'up' : 'down'}`}>{signed(chg)}% 24h</span>
              </div>
            </div>
            <div className="chart-tools">
              <button className={`toggle ${showRetro ? 'on' : ''}`} onClick={() => setShowRetro((v) => !v)} aria-pressed={showRetro}>
                <span className="sw" /> Sinais retroativos
              </button>
            </div>
          </div>
          <PriceChart
            candles={snap.candles}
            signals={snap.signals}
            retro={retro}
            showRetro={showRetro}
            granularity={snap.config.granularity}
            horizon={snap.config.horizon}
            digits={digits}
          />
          <ChartReasoning snap={snap} />
          <div className="chart-legend">
            <span><i className="lg-up" /> Sinal de alta</span>
            <span><i className="lg-down" /> Sinal de baixa</span>
            <span className="up">● WIN</span>
            <span className="down">● LOSS</span>
            {openSig && <span className="gold">┄ Preço de entrada</span>}
            {showRetro && <span>· pontos suaves = retroativo (fora da amostra)</span>}
          </div>
        </section>

        <div className="bottom-row">
          <section className="card flush">
            <div className="card-h" style={{ padding: '16px 18px 4px', marginBottom: 0 }}>
              <h2>Sinais recentes</h2>
              <button className="btn-ghost" style={{ borderStyle: 'solid' }} onClick={() => onNavigate('history')}>
                Ver histórico completo
              </button>
            </div>
            <SignalList signals={snap.signals} limit={6} />
          </section>
          <WalletCard w={snap.wallet} onChanged={onReload} />
        </div>
      </div>

      <div className="col">
        <AgentCard snap={snap} onNavigate={onNavigate} />
        <SignalCard snap={snap} flash={flash} />
        <WinrateCard snap={snap} />
        <p className="caption" style={{ margin: '0 4px' }}>
          Payout {snap.payoutRatio ? num(snap.payoutRatio * 100, 1) + '%' : '—'} · empate em {num(snap.breakEven * 100, 1)}%.
          Os sinais são estimativas estatísticas em fase de testes, não recomendação.
        </p>
      </div>
    </div>
    </>
  );
}
