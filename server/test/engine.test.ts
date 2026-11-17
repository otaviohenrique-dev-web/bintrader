import { describe, expect, it } from 'vitest';
import { makeSignal, resolveSignal } from '../src/engine/settle.js';
import { bandStats, perfStats } from '../src/engine/metrics.js';
import type { Candle } from '../src/deriv/market.js';

const G = 300;
const entry: Candle = { time: 1_000_000, open: 1.1, high: 1.11, low: 1.09, close: 1.1 };
const base = { symbol: 'frxEURUSD', entry, granularity: G, horizon: 3, payoutRatio: 0.85, threshold: 0.03 };
const exitAt = (close: number): Candle => ({ time: entry.time + 3 * G, open: close, high: close, low: close, close });

describe('liquidação de sinais', () => {
  it('entrada = fechamento da vela; expiração = + horizonte', () => {
    const s = makeSignal({ ...base, side: 'CALL', prob: 0.6 });
    expect(s.entryPrice).toBe(1.1);
    expect(s.issuedAt).toBe(entry.time + G);
    expect(s.expiresAt).toBe(entry.time + G + 3 * G);
    expect(s.confidence).toBeCloseTo(0.1, 10);
  });

  it('CALL ganha se subiu, PUT ganha se caiu', () => {
    const call = makeSignal({ ...base, side: 'CALL', prob: 0.6 });
    const put = makeSignal({ ...base, side: 'PUT', prob: 0.4 });
    expect(resolveSignal(call, exitAt(1.101), 0, G).status).toBe('win');
    expect(resolveSignal(call, exitAt(1.099), 0, G).status).toBe('loss');
    expect(resolveSignal(put, exitAt(1.099), 0, G).status).toBe('win');
    expect(resolveSignal(put, exitAt(1.101), 0, G).status).toBe('loss');
  });

  it('empate PERDE nos dois lados', () => {
    const call = makeSignal({ ...base, side: 'CALL', prob: 0.6 });
    const put = makeSignal({ ...base, side: 'PUT', prob: 0.4 });
    expect(resolveSignal(call, exitAt(1.1), 0, G).status).toBe('loss');
    expect(resolveSignal(put, exitAt(1.1), 0, G).status).toBe('loss');
  });

  it('pnl: +payout na vitória, -1 na derrota', () => {
    const call = makeSignal({ ...base, side: 'CALL', prob: 0.6 });
    expect(resolveSignal(call, exitAt(1.2), 0, G).pnl).toBe(0.85);
    expect(resolveSignal(call, exitAt(1.0), 0, G).pnl).toBe(-1);
  });

  it('segue aberto antes da expiração e é anulado se a vela de saída nunca chega', () => {
    const s = makeSignal({ ...base, side: 'CALL', prob: 0.6 });
    expect(resolveSignal(s, undefined, s.expiresAt, G).status).toBe('open');
    expect(resolveSignal(s, undefined, s.expiresAt + 4 * G, G).status).toBe('void');
  });

  it('não reliquida sinal já encerrado', () => {
    const call = makeSignal({ ...base, side: 'CALL', prob: 0.6 });
    const done = resolveSignal(call, exitAt(1.2), 0, G);
    expect(resolveSignal(done, exitAt(0.5), 0, G)).toBe(done);
  });
});

describe('winrate da IA', () => {
  it('status "coletando" com amostra pequena, mesmo com 100% de acerto', () => {
    const s = perfStats(Array.from({ length: 10 }, () => ({ win: true, pnl: 0.85 })), 0.85);
    expect(s.winRate).toBe(1);
    expect(s.status).toBe('coletando');
  });

  it('50% de acerto com payout 85% fica "abaixo" do empate', () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ win: i % 2 === 0, pnl: i % 2 === 0 ? 0.85 : -1 }));
    const s = perfStats(items, 0.85);
    expect(s.status).toBe('abaixo');
    expect(s.pnl).toBeLessThan(0);
  });

  it('só declara "vantagem" com n grande e IC acima do empate', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ win: i % 10 < 6, pnl: i % 10 < 6 ? 0.85 : -1 })); // 60%
    expect(perfStats(items, 0.85).status).toBe('vantagem');
  });

  it('sequência atual e últimos 50', () => {
    const items = [true, true, false, false, false].map((w) => ({ win: w, pnl: w ? 1 : -1 }));
    const s = perfStats(items, 0.85);
    expect(s.streak).toEqual({ kind: 'L', len: 3 });
    expect(s.last50?.n).toBe(5);
  });

  it('faixas de confiança separam retro e ao vivo', () => {
    const rows = [
      { confidence: 0.035, win: true },
      { confidence: 0.06, win: false },
      { confidence: 0.2, win: true },
    ];
    const b = bandStats(rows, [], [0.03, 0.05, 0.08, 1]);
    expect(b).toHaveLength(3);
    expect(b[0].retro).toEqual({ n: 1, winRate: 1 });
    expect(b[1].retro).toEqual({ n: 1, winRate: 0 });
    expect(b[2].live).toBeNull();
  });
});
