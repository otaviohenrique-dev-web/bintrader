import type { Snapshot } from '../api';
import { int, pct, sideLabel } from '../lib/format';
import type { Tab } from '../lib/tabs';
import { AgentMark } from './Logo';

const HOUR_TXT = { forte: 'hora forte', neutro: 'hora neutra', fraco: 'hora fraca', 'sem dados': 'hora sem dados' } as const;

/** O protagonista: quem é, o que está fazendo agora e quanto já aprendeu. */
export default function AgentCard({ snap, onNavigate }: { snap: Snapshot; onNavigate: (t: Tab) => void }) {
  const open = snap.signals.find((s) => s.status === 'open');
  const pred = snap.lastPrediction;
  const L = snap.learning;
  const h = snap.hourNow;

  const doing = snap.stale
    ? 'Aguardando o mercado reabrir'
    : open
      ? `Posicionada em ${sideLabel(open.side)} · ${snap.config.name}`
      : pred
        ? `Lendo ${snap.config.name}: ${pct(pred.prob, 0)} de chance de alta`
        : 'Esperando a primeira vela';

  return (
    <section className="card agent">
      <div className="agent-head">
        <div className="agent-avatar"><AgentMark size={46} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="agent-name">
            Aegis IA <span className="agent-ver mono">{snap.version.label}</span>
            <span className="status-chip gold"><i />Alpha</span>
          </div>
          <div className="agent-doing"><span className="live-dot" />{doing}</div>
        </div>
      </div>
      <div className="agent-facts">
        <div><b className="mono">{int(snap.builds)}</b><span>builds</span></div>
        <div><b className="mono">{int(L.historyCandles)}</b><span>velas aprendidas</span></div>
        <div><b className="mono">{(L.threshold * 100).toFixed(0)} pp</b><span>seletividade</span></div>
      </div>
      <div className="agent-tags">
        <span className="status-chip"><i />{snap.toolkit.label}</span>
        <span className={`status-chip ${h.rating === 'forte' ? 'up' : h.rating === 'fraco' ? 'down' : ''}`}><i />{HOUR_TXT[h.rating]}</span>
      </div>
      <button className="btn-link" onClick={() => onNavigate('ai')}>Conhecer a Aegis IA por dentro →</button>
    </section>
  );
}
