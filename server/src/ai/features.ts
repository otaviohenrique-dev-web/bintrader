import type { Candle } from '../deriv/market.js';
import { atr, bollinger, ema, macd, rsi, stochK } from '../indicators/index.js';

export const FEATURE_NAMES = [
  'ret1/ATR',
  'ret3/ATR',
  'ret5/ATR',
  'ret10/ATR',
  'RSI14',
  'MACD hist/ATR',
  'Bollinger %B',
  'EMA9-EMA21/ATR',
  'Stoch %K',
  'corpo/range',
  'pavio sup.',
  'pavio inf.',
  'log(ATR/preço)',
  'hora (sin)',
  'hora (cos)',
] as const;

/** Matriz de features por vela. null = aquecimento ou vela degenerada. Usa só dados até a vela i. */
export function computeFeatureMatrix(candles: Candle[]): (number[] | null)[] {
  const o = candles.map((c) => c.open);
  const h = candles.map((c) => c.high);
  const l = candles.map((c) => c.low);
  const c = candles.map((k) => k.close);

  const A = atr(h, l, c, 14);
  const R = rsi(c, 14);
  const M = macd(c).hist;
  const B = bollinger(c, 20, 2);
  const E9 = ema(c, 9);
  const E21 = ema(c, 21);
  const S = stochK(h, l, c, 14);

  return candles.map((k, i) => {
    if (i < 10) return null;
    const a = A[i];
    if (!Number.isFinite(a) || a <= 0) return null;
    const range = h[i] - l[i];
    const eps = 1e-12;
    const bw = B.upper[i] - B.lower[i];
    const hour = ((k.time % 86400) / 86400) * 2 * Math.PI;
    const row = [
      (c[i] - c[i - 1]) / a,
      (c[i] - c[i - 3]) / a,
      (c[i] - c[i - 5]) / a,
      (c[i] - c[i - 10]) / a,
      R[i] / 100 - 0.5,
      M[i] / a,
      bw > 0 ? (c[i] - B.lower[i]) / bw - 0.5 : 0,
      (E9[i] - E21[i]) / a,
      S[i] / 100 - 0.5,
      (c[i] - o[i]) / (range + eps),
      (h[i] - Math.max(o[i], c[i])) / (range + eps),
      (Math.min(o[i], c[i]) - l[i]) / (range + eps),
      Math.log(a / c[i]),
      Math.sin(hour),
      Math.cos(hour),
    ];
    return row.every(Number.isFinite) ? row : null;
  });
}

export interface Dataset {
  X: number[][];
  y: number[]; // 1 = fechamento em t+horizon > fechamento em t (CALL vence); empate = 0
  idx: number[]; // índice da vela de entrada
  times: number[];
}

/** Rótulo: o preço de fechamento `horizon` velas à frente é estritamente maior? */
export function buildDataset(candles: Candle[], horizon: number): Dataset {
  const F = computeFeatureMatrix(candles);
  const ds: Dataset = { X: [], y: [], idx: [], times: [] };
  for (let i = 0; i < candles.length - horizon; i++) {
    const row = F[i];
    if (!row) continue;
    ds.X.push(row);
    ds.y.push(candles[i + horizon].close > candles[i].close ? 1 : 0);
    ds.idx.push(i);
    ds.times.push(candles[i].time);
  }
  return ds;
}

/** Features da última vela fechada (para inferência ao vivo). */
export function latestFeatures(candles: Candle[]): number[] | null {
  const F = computeFeatureMatrix(candles);
  return F[F.length - 1];
}
