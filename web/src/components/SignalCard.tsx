import type { Snapshot } from '../api';
import { useNow } from '../hooks/hooks';
import { ago, hhmm, mmss, pct, price, sideLabel, signed } from '../lib/format';
import Icon from './Icon';
import NextSignal from './NextSignal';

/** Anel de contagem regressiva até a liquidação. */
function Ring({ frac, label }: { frac: number; label: string }) {
  const r = 33;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg width="74" height="74" viewBox="0 0 74 74">
        <circle cx="37" cy="37" r={r} fill="none" stroke="var(--s3)" strokeWidth="4" />
        <circle
          cx="37"
          cy="37"
          r={r}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, frac)))}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div className="t mono">{label}</div>
    </div>
  );
}

/** Dial da probabilidade: onde o modelo está em relação à zona de decisão. */
function Dial({ prob, thr }: { prob: number; thr: number }) {
  const lo = 0.4;
  const hi = 0.6;
  const x = (p: number) => ((Math.min(hi, Math.max(lo, p)) - lo) / (hi - lo)) * 100;
  return (
    <div className="dial">
      <div className="dial-track">
        <div className="dial-zone l" style={{ width: `${x(0.5 - thr)}%` }} />
        <div className="dial-zone r" style={{ width: `${100 - x(0.5 + thr)}%` }} />
        <div className="dial-mid" />
        <div className="dial-dot" style={{ left: `${x(prob)}%` }} />
      </div>
      <div className="dial-labels">
        <span>Baixa {'<'} {pct(0.5 - thr, 1)}</span>
        <span>50%</span>
        <span>Alta {'>'} {pct(0.5 + thr, 1)}</span>
      </div>
    </div>
  );
}

export default function SignalCard({ snap, flash }: { snap: Snapshot; flash: 'win' | 'loss' | null }) {
  const now = useNow(1000);
  const open = snap.signals.find((s) => s.status === 'open');
  const lastDone = [...snap.signals].reverse().find((s) => s.status === 'win' || s.status === 'loss');
  const pred = snap.lastPrediction;
  const total = snap.config.horizon * snap.config.granularity;
  const digits = 5;

  return (
    <section className={`card signal ${flash ? `flash-${flash}` : ''}`}>
      <div className="card-h">
        <span className="eyebrow">Sinal atual</span>
        {snap.stale ? (
          <span className="status-chip warn"><i />Mercado parado</span>
        ) : open ? (
          <span className="status-chip gold"><i />Em andamento</span>
        ) : (
          <span className="status-chip"><i />Monitorando</span>
        )}
      </div>

      {open ? (
        <>
          <div className="sig-main">
            <div className="sig-dir">
              <div className={`sig-arrow ${open.side === 'CALL' ? 'up' : 'down'}`}>
                <Icon name={open.side === 'CALL' ? 'up' : 'down'} size={26} />
              </div>
              <div>
                <div className="sig-word">{sideLabel(open.side)}</div>
                <div className="sig-conf">
                  Probabilidade <span className="mono">{pct(open.side === 'CALL' ? open.prob : 1 - open.prob, 1)}</span>
                </div>
              </div>
            </div>
            <Ring frac={1 - (open.expiresAt - now) / total} label={mmss(open.expiresAt - now)} />
          </div>
          <div className="kv">
            <div><div className="k">Preço de entrada</div><div className="v mono">{price(open.entryPrice, digits)}</div></div>
            <div><div className="k">Resolve às</div><div className="v mono">{hhmm(open.expiresAt)}</div></div>
            <div><div className="k">Payout</div><div className="v mono">{pct(open.payoutRatio, 1)}</div></div>
            <div><div className="k">Acerto p/ empatar</div><div className="v mono">{pct(1 / (1 + open.payoutRatio), 1)}</div></div>
          </div>
        </>
      ) : (
        <>
          <div className="idle-title">{snap.stale ? 'Sem dados novos' : 'Aguardando setup'}</div>
          <div className="idle-sub">
            {snap.stale
              ? 'O ativo está fora do horário de negociação. Voltamos a ler quando as velas retomarem.'
              : pred
                ? pred.side
                  ? (pred.reason ?? 'Leitura acima do limiar.')
                  : 'A leitura atual não passa do limiar de confiança. Sem entrada é também uma decisão.'
                : 'Esperando a primeira vela fechada.'}
          </div>
          {pred && !snap.stale && (
            <>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Leitura do modelo · prob. de alta</div>
              <Dial prob={pred.prob} thr={pred.threshold} />
              <div className="mono" style={{ textAlign: 'center', marginTop: 12, fontSize: 18 }}>{pct(pred.prob, 1)}</div>
            </>
          )}
          {snap.nextCloseAt && !snap.stale && (
            <div className="kv" style={{ marginTop: 16 }}>
              <div><div className="k">Próxima leitura em</div><div className="v mono">{mmss(snap.nextCloseAt - now)}</div></div>
              <div><div className="k">Payout atual</div><div className="v mono">{snap.payoutRatio ? pct(snap.payoutRatio, 1) : '—'}</div></div>
            </div>
          )}
        </>
      )}

      <NextSignal snap={snap} />

      {lastDone && (
        <div className="last-result">
          <span>
            Último resultado · {sideLabel(lastDone.side)}{' '}
            <span className="muted">{ago(lastDone.settledAt ?? lastDone.expiresAt, now)}</span>
          </span>
          <span>
            <span className={`pill ${lastDone.status}`}>{lastDone.status === 'win' ? 'WIN' : 'LOSS'}</span>{' '}
            <span className={`mono ${lastDone.status === 'win' ? 'up' : 'down'}`}>{signed(lastDone.pnl ?? 0)}</span>
          </span>
        </div>
      )}
    </section>
  );
}
