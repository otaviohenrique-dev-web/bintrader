import type { Candle } from '../deriv/market.js';

/** PRNG determinístico (mulberry32) para testes reprodutíveis. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Gera velas sintéticas.
 *  phi = 0   -> passeio aleatório puro (PLACEBO: não existe edge nenhum)
 *  phi > 0   -> retornos autocorrelacionados (CONTROLE POSITIVO: edge plantado)
 */
export function generateCandles(
  n: number,
  opts: { seed?: number; phi?: number; vol?: number; start?: number; granularity?: number } = {},
): Candle[] {
  const { seed = 1, phi = 0, vol = 0.0006, start = 1.1, granularity = 300 } = opts;
  const rand = rng(seed);
  const t0 = 1_700_000_000;
  const candles: Candle[] = [];
  let price = start;
  let prevRet = 0;
  for (let i = 0; i < n; i++) {
    const ret = phi * prevRet + gaussian(rand) * vol;
    prevRet = ret;
    const open = price;
    const close = price * (1 + ret);
    const wick = Math.abs(gaussian(rand)) * vol * 0.4 * price;
    candles.push({
      time: t0 + i * granularity,
      open,
      close,
      high: Math.max(open, close) + wick * rand(),
      low: Math.min(open, close) - wick * rand(),
    });
    price = close;
  }
  return candles;
}
