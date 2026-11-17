import { useEffect, useRef } from 'react';
import type { Snapshot } from '../api';
import { useLocalState, useNow } from '../hooks/hooks';
import { brl, hhmmss, mmss, pct, sideLabel } from '../lib/format';
import Icon from './Icon';

/** Bipe curto (WebAudio). Só funciona depois de o usuário ligar o som (gesto do clique). */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start();
    o.stop(ctx.currentTime + 0.5);
    setTimeout(() => void ctx.close(), 700);
  } catch {
    /* sem áudio */
  }
}

export type NextState = 'none' | 'blocked' | 'watching' | 'alert';

/** Estado do próximo sinal a partir da prévia e do relógio. */
export function nextState(snap: Snapshot, now: number) {
  const p = snap.preview;
  if (!p) return { state: 'none' as NextState, left: 0 };
  const left = p.closeAt - now;
  if (!p.canOpen) return { state: 'blocked' as NextState, left };
  if (p.side && left <= snap.preAlerts.secondsAhead && left > -5) return { state: 'alert' as NextState, left };
  return { state: 'watching' as NextState, left };
}

/** Bipe uma vez por vela quando o pré-alerta dispara (se o som estiver ligado). */
export function useAlertSound(snap: Snapshot, now: number) {
  const [sound] = useLocalState<'on' | 'off'>('aegis.sound', 'off');
  const done = useRef<number | null>(null);
  const { state } = nextState(snap, now);
  const candle = snap.preview?.candleTime ?? null;
  useEffect(() => {
    if (sound === 'on' && state === 'alert' && candle !== null && done.current !== candle) {
      done.current = candle;
      beep();
    }
  }, [sound, state, candle]);
}

/** Pílula compacta no cabeçalho do gráfico. */
export function NextPill({ snap }: { snap: Snapshot }) {
  const now = useNow(1000);
  useAlertSound(snap, now);
  const p = snap.preview;
  const { state, left } = nextState(snap, now);
  if (!p || state === 'none') return null;
  if (state === 'alert' && p.side) {
    return (
      <span className="next-pill alert">
        <i /> Próximo sinal: <b>{sideLabel(p.side).toUpperCase()}</b> {pct(p.side === 'CALL' ? p.prob : 1 - p.prob, 0)} · {hhmmss(p.closeAt)} <span className="mono">({mmss(left)})</span>
      </span>
    );
  }
  return (
    <span className="next-pill">
      {state === 'blocked' ? `Próxima leitura ${hhmmss(p.closeAt)}` : `Próxima leitura ${hhmmss(p.closeAt)} (${mmss(left)})`}
    </span>
  );
}

/** Bloco completo no cartão do sinal: prévia, passo a passo na Deriv e confiabilidade medida. */
export default function NextSignal({ snap }: { snap: Snapshot }) {
  const now = useNow(1000);
  const [sound, setSound] = useLocalState<'on' | 'off'>('aegis.sound', 'off');
  const p = snap.preview;
  const { state, left } = nextState(snap, now);
  const pa = snap.preAlerts;
  if (!p) return null;

  const toggle = () => {
    const next = sound === 'on' ? 'off' : 'on';
    setSound(next);
    if (next === 'on') beep(); // gesto do usuário: libera o áudio e confirma o som
  };

  return (
    <div className={`next ${state}`}>
      <div className="next-h">
        <span className="eyebrow">Próximo sinal</span>
        <button className="toggle-sound" onClick={toggle} aria-pressed={sound === 'on'} title="Bipe quando o pré-alerta disparar">
          <Icon name="bell" size={13} /> Som {sound === 'on' ? 'ligado' : 'desligado'}
        </button>
      </div>

      {state === 'blocked' && (
        <p className="next-line">Há um sinal aberto até <b className="mono">{hhmmss(p.blockedUntil ?? p.closeAt)}</b>. Só leio de novo depois disso.</p>
      )}

      {state === 'watching' && (
        <p className="next-line">
          Prévia agora: {p.side ? <b className={p.side === 'CALL' ? 'up' : 'down'}>{sideLabel(p.side)} ({pct(p.side === 'CALL' ? p.prob : 1 - p.prob, 0)})</b> : <b>sem sinal</b>}.
          {' '}A vela fecha às <b className="mono">{hhmmss(p.closeAt)}</b> (em <span className="mono">{mmss(left)}</span>). O pré-alerta vem {pa.secondsAhead} s antes.
        </p>
      )}

      {state === 'alert' && p.side && (
        <>
          <p className="next-line strong">
            Prepare: <b className={p.side === 'CALL' ? 'up' : 'down'}>{sideLabel(p.side).toUpperCase()}</b> às <b className="mono">{hhmmss(p.closeAt)}</b> <span className="mono">(em {mmss(left)})</span>
          </p>
          <ol className="ticket">
            <li>Na Deriv: <b>Ascensão/Queda</b> · <b>{snap.config.name}</b></li>
            <li>Duração <b>{snap.config.durationMin} min</b> · valor <b>{brl(snap.wallet.stake)}</b> <small>(use o equivalente em US$)</small></li>
            <li>Clique em <b className={p.side === 'CALL' ? 'up' : 'down'}>{p.side === 'CALL' ? 'Ascensão' : 'Queda'}</b> quando a vela fechar, às {hhmmss(p.closeAt)}</li>
          </ol>
          <p className="next-warn">É só uma prévia: se o fechamento inverter o lado, o sinal muda e eu aviso.</p>
        </>
      )}

      <p className="caption" style={{ margin: '10px 0 0' }}>
        {pa.n >= 5
          ? `Pré-alertas confirmados no fechamento: ${pct(pa.rate ?? 0, 0)} (${pa.confirmed} de ${pa.n}; ${pa.inverted} invertidos).`
          : `Ainda medindo a confiabilidade do pré-alerta (${pa.n} conferidos).`}
      </p>
    </div>
  );
}
