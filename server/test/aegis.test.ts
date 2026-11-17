import { describe, expect, it } from 'vitest';
import { walkForward } from '../src/ai/aegis.js';
import { generateCandles } from '../src/sim/randomWalk.js';
import { atr, rsi, ema } from '../src/indicators/index.js';

const opts = {
  horizon: 1,
  trainSize: 1500,
  testSize: 250,
  threshold: 0.02,
  payoutRatio: 0.85,
  alpha: 0.05,
};

describe('indicadores', () => {
  it('RSI fica entre 0 e 100 e EMA/ATR têm aquecimento NaN', () => {
    const c = generateCandles(300, { seed: 3 });
    const r = rsi(c.map((k) => k.close)).filter(Number.isFinite);
    expect(Math.min(...r)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...r)).toBeLessThanOrEqual(100);
    expect(Number.isNaN(ema(c.map((k) => k.close), 20)[5])).toBe(true);
    expect(atr(c.map((k) => k.high), c.map((k) => k.low), c.map((k) => k.close))[20]).toBeGreaterThan(0);
  });
});

describe('PLACEBO — passeio aleatório não pode render edge', () => {
  // Se este teste falhar, há vazamento de dados (look-ahead) no pipeline.
  it.each([11, 22, 33, 44])('seed %i: não aprova e win rate ~50%', (seed) => {
    const candles = generateCandles(9000, { seed, phi: 0 });
    const { summary } = walkForward(candles, opts);
    expect(summary.verdict).not.toBe('APTO_PARA_DEMO');
    expect(summary.winRate).toBeGreaterThan(0.45);
    expect(summary.winRate).toBeLessThan(0.55);
  });
});

describe('CONTROLE POSITIVO — edge plantado deve ser encontrado', () => {
  // Se este falhar, o modelo/walk-forward está cego (não consegue achar edge nem quando existe).
  it('autocorrelação phi=0.3 vira win rate bem acima de 54%', () => {
    const candles = generateCandles(9000, { seed: 7, phi: 0.3 });
    const { summary } = walkForward(candles, opts);
    expect(summary.trades).toBeGreaterThan(300);
    expect(summary.winRate).toBeGreaterThan(0.56);
    expect(summary.verdict).toBe('APTO_PARA_DEMO');
  });
});
