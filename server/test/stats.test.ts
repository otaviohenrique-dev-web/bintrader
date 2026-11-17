import { describe, expect, it } from 'vitest';
import {
  breakEvenWinRate,
  expectedValue,
  kellyFraction,
  pValueAbove,
  ratioFromPayout,
  sampleSizeToDetect,
  summarize,
  wilson,
  type Trade,
} from '../src/backtest/stats.js';

describe('matemática do payout', () => {
  it('payout 18.27 sobre stake 10 -> empate em ~54.7%', () => {
    const r = ratioFromPayout(18.27, 10);
    expect(r).toBeCloseTo(0.827, 3);
    expect(breakEvenWinRate(r)).toBeCloseTo(0.5473, 3);
  });
  it('EV é zero exatamente no win rate de empate', () => {
    const r = 0.85;
    expect(expectedValue(breakEvenWinRate(r), r)).toBeCloseTo(0, 10);
  });
  it('Kelly é zero sem vantagem e positivo com vantagem', () => {
    expect(kellyFraction(0.5, 0.85)).toBe(0);
    expect(kellyFraction(0.6, 0.85)).toBeGreaterThan(0);
  });
  it('detectar 2 p.p. de vantagem exige milhares de operações', () => {
    const n = sampleSizeToDetect(0.5473, 0.5673);
    expect(n).toBeGreaterThan(1500);
  });
});

describe('inferência', () => {
  it('Wilson contém a proporção observada', () => {
    const [lo, hi] = wilson(55, 100);
    expect(lo).toBeLessThan(0.55);
    expect(hi).toBeGreaterThan(0.55);
  });
  it('55 vitórias em 100 NÃO provam edge sobre 54.7%', () => {
    expect(pValueAbove(55, 100, 0.5473)).toBeGreaterThan(0.4);
  });
  it('gate recusa amostra pequena mesmo com win rate alto', () => {
    const trades: Trade[] = Array.from({ length: 40 }, (_, i) => ({
      time: i,
      side: 'CALL',
      prob: 0.6,
      win: i % 10 < 8, // 80%
      pnl: i % 10 < 8 ? 0.85 : -1,
    }));
    const s = summarize(trades, 0.85);
    expect(s.verdict).toBe('PROMISSOR_INSUFICIENTE');
  });
});
