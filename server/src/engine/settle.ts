import type { Candle } from '../deriv/market.js';
import type { Signal } from './types.js';

export interface MakeSignalArgs {
  symbol: string;
  side: 'CALL' | 'PUT';
  prob: number;
  /** vela de entrada (a última vela FECHADA no momento do sinal) */
  entry: Candle;
  granularity: number;
  horizon: number; // velas
  payoutRatio: number;
  threshold: number;
}

/**
 * Entrada = fechamento da vela `entry`; saída = fechamento da vela `horizon` à frente.
 * É exatamente o rótulo usado no treino (close[i+h] > close[i]).
 */
export function makeSignal(a: MakeSignalArgs): Signal {
  const issuedAt = a.entry.time + a.granularity;
  return {
    id: `${a.symbol}-${a.entry.time}`,
    symbol: a.symbol,
    side: a.side,
    prob: a.prob,
    confidence: Math.abs(a.prob - 0.5),
    entryTime: a.entry.time,
    issuedAt,
    expiresAt: issuedAt + a.horizon * a.granularity,
    entryPrice: a.entry.close,
    status: 'open',
    payoutRatio: a.payoutRatio,
    threshold: a.threshold,
  };
}

/**
 * Liquida um sinal contra a vela de saída. Empate PERDE (regra do Rise/Fall).
 * Sem vela de saída após a expiração (ex.: mercado fechou) o sinal é anulado.
 */
export function resolveSignal(
  s: Signal,
  exit: Candle | undefined,
  nowSec: number,
  granularity: number,
): Signal {
  if (s.status !== 'open') return s;
  if (exit) {
    const win = s.side === 'CALL' ? exit.close > s.entryPrice : exit.close < s.entryPrice;
    return {
      ...s,
      status: win ? 'win' : 'loss',
      exitPrice: exit.close,
      pnl: win ? s.payoutRatio : -1,
      settledAt: exit.time + granularity,
    };
  }
  if (nowSec > s.expiresAt + 3 * granularity) {
    return { ...s, status: 'void', pnl: 0, settledAt: nowSec };
  }
  return s;
}

/** Lado que a leitura indicaria com a probabilidade de alta `prob` e o limiar `thr`. */
export function previewSide(prob: number, thr: number): 'CALL' | 'PUT' | null {
  const dev = prob - 0.5;
  return dev >= thr ? 'CALL' : dev <= -thr ? 'PUT' : null;
}

/**
 * Um novo sinal só nasce se não houver outro aberto ou se o aberto vence até o fechamento da vela
 * (assim um sinal pode abrir na mesma vela em que o anterior é liquidado).
 */
export function canOpenAt(open: Pick<Signal, 'expiresAt'> | undefined, closeAt: number): boolean {
  return !open || open.expiresAt <= closeAt;
}

export type PreAlertOutcome = 'confirmado' | 'invertido' | 'sem sinal';

/** O que aconteceu com um pré-alerta quando a vela realmente fechou. */
export function preAlertOutcome(preSide: 'CALL' | 'PUT', finalSide: 'CALL' | 'PUT' | null): PreAlertOutcome {
  if (finalSide === preSide) return 'confirmado';
  return finalSide === null ? 'sem sinal' : 'invertido';
}
