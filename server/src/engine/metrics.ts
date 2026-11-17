import { breakEvenWinRate, pValueAbove, wilson } from '../backtest/stats.js';
import type { BandStat, PerfStats } from './types.js';

export interface Outcome {
  win: boolean;
  pnl: number;
}

/** Mínimo de operações para o selo deixar de ser "coletando". */
export const MIN_N_STATUS = 30;
/** Mínimo para declarar vantagem estatística (alinhado ao gate do laboratório). */
export const MIN_N_EDGE = 100;

export function perfStats(items: Outcome[], ratio: number): PerfStats {
  const n = items.length;
  const wins = items.filter((i) => i.win).length;
  const winRate = n ? wins / n : 0;
  const breakEven = breakEvenWinRate(ratio);
  const ci95 = wilson(wins, n);
  const pValue = pValueAbove(wins, n, breakEven);
  const pnl = items.reduce((s, i) => s + i.pnl, 0);

  const recent = items.slice(-50);
  const last50 = recent.length
    ? { n: recent.length, winRate: recent.filter((i) => i.win).length / recent.length }
    : null;

  let streak: PerfStats['streak'] = null;
  if (n) {
    const kind = items[n - 1].win ? 'W' : 'L';
    let len = 0;
    for (let i = n - 1; i >= 0 && items[i].win === (kind === 'W'); i--) len++;
    streak = { kind, len };
  }

  let status: PerfStats['status'];
  if (n < MIN_N_STATUS) status = 'coletando';
  else if (n >= MIN_N_EDGE && ci95[0] > breakEven && pValue < 0.05) status = 'vantagem';
  else if (winRate < breakEven) status = 'abaixo';
  else status = 'inconclusivo';

  return { n, wins, losses: n - wins, winRate, ci95, breakEven, pnl, pValue, last50, streak, status };
}

export interface PaceStats {
  n: number;
  /** % dos sinais emitidos na 1ª vela depois do vencimento do anterior */
  backToBackPct: number;
  /** espera média entre o vencimento de um sinal e o próximo, em minutos */
  avgIdleMin: number;
  /** % do tempo com posição aberta */
  inPositionPct: number;
  /** % de sinais de Alta (50% = equilibrado; extremos indicam viés) */
  callPct: number;
}

/**
 * Ritmo de operação: o quanto a IA fica "sempre posicionada" e se tem viés direcional.
 * Cada item precisa de issuedAt/expiresAt em segundos.
 */
export function paceStats(
  items: { issuedAt: number; expiresAt: number; side: 'CALL' | 'PUT' }[],
  granularity: number,
): PaceStats | null {
  if (items.length < 2) return null;
  const s = [...items].sort((a, b) => a.issuedAt - b.issuedAt);
  let b2b = 0;
  let idleSum = 0;
  let held = 0;
  for (let i = 0; i < s.length; i++) {
    held += s[i].expiresAt - s[i].issuedAt;
    if (i > 0) {
      const idle = Math.max(0, s[i].issuedAt - s[i - 1].expiresAt);
      idleSum += idle;
      if (idle <= granularity) b2b++;
    }
  }
  const span = s[s.length - 1].expiresAt - s[0].issuedAt;
  return {
    n: s.length,
    backToBackPct: b2b / (s.length - 1),
    avgIdleMin: idleSum / (s.length - 1) / 60,
    inPositionPct: span > 0 ? Math.min(1, held / span) : 0,
    callPct: s.filter((x) => x.side === 'CALL').length / s.length,
  };
}

/** Desempenho por faixa de confiança (distância de 50%). */
export function bandStats(
  retro: { confidence: number; win: boolean }[],
  live: { confidence: number; win: boolean }[],
  edges: number[],
): BandStat[] {
  const agg = (rows: { confidence: number; win: boolean }[], lo: number, hi: number) => {
    const sel = rows.filter((r) => r.confidence >= lo && r.confidence < hi);
    return sel.length ? { n: sel.length, winRate: sel.filter((r) => r.win).length / sel.length } : null;
  };
  const out: BandStat[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const f = (v: number) => (v * 100).toFixed(0);
    out.push({
      label: hi >= 1 ? `≥ ${f(lo)} pp` : `${f(lo)}–${f(hi)} pp`,
      retro: agg(retro, lo, hi),
      live: agg(live, lo, hi),
    });
  }
  return out;
}
