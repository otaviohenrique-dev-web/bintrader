import { describe, expect, it } from 'vitest';
import { bestWindows, hourStats, rateHour } from '../src/engine/hours.js';
import { buildPlan, simulateSession } from '../src/engine/plan.js';
import { DEFAULT_TOOLKIT, experimentGrid, nextVersion, toolkitKey, versionLabel } from '../src/engine/toolkit.js';
import { computeFeatureMatrix, featureNames, DEFAULT_GROUPS } from '../src/ai/features.js';
import { LogisticModel } from '../src/ai/model.js';
import { generateCandles } from '../src/sim/randomWalk.js';

// 12:00 local de um dia qualquer + h horas
const base = new Date(2026, 5, 1, 0, 0, 0).getTime() / 1000;
const at = (hour: number, day = 0) => base + day * 86400 + hour * 3600 + 60;

describe('plano de entrada', () => {
  const sem = { balance: 1000, profile: 'moderado' as const, payoutRatio: 0.8, winRate: 0.508, ci95: [0.49, 0.53] as [number, number], n: 7000 };

  it('sem vantagem comprovada: modo estudo, metade do teto do perfil', () => {
    const p = buildPlan(sem);
    expect(p.mode).toBe('estudo');
    expect(p.stake).toBe(5); // 0,5% de R$ 1.000
  });

  it('com vantagem validada: usa 1/4 de Kelly, nunca acima do teto', () => {
    const p = buildPlan({ ...sem, winRate: 0.62, ci95: [0.6, 0.64], n: 800 });
    expect(p.mode).toBe('validado');
    expect(p.stakePct).toBeLessThanOrEqual(1.0001);
    expect(p.stake).toBeGreaterThan(0);
  });

  it('amostra pequena nunca vira "validado", mesmo com acerto alto', () => {
    expect(buildPlan({ ...sem, winRate: 0.9, ci95: [0.6, 0.97], n: 20 }).mode).toBe('estudo');
  });

  it('a esperança negativa vira aviso explícito', () => {
    const p = buildPlan(sem);
    expect(p.evPerTrade).toBeLessThan(0);
    expect(p.warnings.join(' ')).toContain('Esperança negativa');
  });

  it('stops em R$ e quantas derrotas fecham o dia', () => {
    const p = buildPlan({ ...sem, stopLossPct: 5, stopGainPct: 4 });
    expect(p.stopLoss).toBe(50);
    expect(p.stopGain).toBe(40);
    expect(p.lossesToStop).toBe(10);
  });

  it('banca pequena respeita o mínimo de R$ 1', () => {
    const p = buildPlan({ ...sem, balance: 60 });
    expect(p.stake).toBe(1);
    expect(p.warnings.join(' ')).toContain('Banca pequena');
  });

  it('simulação: probabilidades somam 1 e é determinística', () => {
    const a = simulateSession({ p: 0.5, ratio: 0.8, stake: 10, stopGain: 50, stopLoss: 50, ops: 12, seed: 3 });
    const b = simulateSession({ p: 0.5, ratio: 0.8, stake: 10, stopGain: 50, stopLoss: 50, ops: 12, seed: 3 });
    expect(a).toEqual(b);
    expect(a.pGain + a.pLoss + a.pNeither).toBeCloseTo(1, 10);
  });

  it('com acerto abaixo do empate, o stop loss é mais provável que o gain', () => {
    const s = simulateSession({ p: 0.47, ratio: 0.8, stake: 10, stopGain: 40, stopLoss: 40, ops: 40, runs: 6000, seed: 1 });
    expect(s.pLoss).toBeGreaterThan(s.pGain);
    expect(s.avgResult).toBeLessThan(0);
  });
});

describe('melhores horários', () => {
  it('agrega por hora local e conta dias distintos', () => {
    const trades = [
      { at: at(9, 0), win: true, pnl: 0.8 },
      { at: at(9, 0) + 600, win: false, pnl: -1 },
      { at: at(9, 1), win: true, pnl: 0.8 },
      { at: at(14, 0), win: false, pnl: -1 },
    ];
    const h = hourStats(trades);
    expect(h[9].n).toBe(3);
    expect(h[9].days).toBe(2);
    expect(h[9].perHour).toBeCloseTo(1.5, 5);
    expect(h[14].winRate).toBe(0);
    expect(h[3].winRate).toBeNull();
  });

  it('janela forte aparece primeiro, mas com 24 janelas testadas quase nada é "significativo"', () => {
    const trades: { at: number; win: boolean; pnl: number }[] = [];
    for (let d = 0; d < 60; d++) {
      for (let h = 0; h < 24; h++) {
        for (let k = 0; k < 4; k++) {
          const win = h >= 8 && h <= 10 ? k < 3 : k < 2; // 75% nas 8–10h; 50% no resto
          trades.push({ at: at(h, d) + k * 60, win, pnl: win ? 0.8 : -1 });
        }
      }
    }
    const w = bestWindows(hourStats(trades), 0.5556);
    expect(w[0].start).toBe(8);
    expect(w[0].winRate).toBeCloseTo(0.75, 2);
    expect(w[0].opsPerWindow).toBeCloseTo(12, 5); // 4 por hora × 3 horas
    expect(w[0].significant).toBe(true); // efeito enorme, passa até com Bonferroni
    expect(w.every((x) => x.start !== 9 && x.start !== 10)).toBe(true); // sem sobreposição
  });

  it('ruído puro não gera janela significativa', () => {
    const trades: { at: number; win: boolean; pnl: number }[] = [];
    let s = 1;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 6000; i++) {
      const win = r() < 0.5;
      trades.push({ at: at(Math.floor(r() * 24), Math.floor(r() * 60)), win, pnl: win ? 0.8 : -1 });
    }
    expect(bestWindows(hourStats(trades), 0.5556).some((w) => w.significant)).toBe(false);
  });

  it('classifica a hora atual frente à média', () => {
    const hs = hourStats(Array.from({ length: 300 }, (_, i) => ({ at: at(9, i % 30), win: i % 10 < 7, pnl: 0 })));
    expect(rateHour(hs, 9, 0.5).rating).toBe('forte');
    expect(rateHour(hs, 4, 0.5).rating).toBe('sem dados');
  });
});

describe('ferramentas e versões', () => {
  it('a grade só tem hipóteses válidas e inclui a configuração atual', () => {
    const g = experimentGrid();
    expect(g.length).toBeGreaterThan(30);
    expect(g.every((t) => (t.durationMin * 60) % t.granularity === 0)).toBe(true);
    expect(g.some((t) => toolkitKey(t) === toolkitKey(DEFAULT_TOOLKIT))).toBe(true);
    expect(new Set(g.map(toolkitKey)).size).toBe(g.length);
  });

  it('versão cresce de forma exponencial com o ganho de acerto e nunca cai', () => {
    expect(nextVersion(1.1, 1)).toBeCloseTo(1.21, 2); // +1 p.p. = +10%
    expect(nextVersion(1.21, 1)).toBeCloseTo(1.33, 2); // composto
    expect(nextVersion(1.1, 0)).toBe(1.1);
    expect(nextVersion(1.1, -3)).toBe(1.1);
    expect(versionLabel(1.1)).toBe('1.10');
  });

  it('o conjunto padrão mantém as 15 variáveis da v1.1 e o conjunto completo é maior', () => {
    const c = generateCandles(400, { seed: 5 });
    const a = computeFeatureMatrix(c, DEFAULT_GROUPS).filter(Boolean) as number[][];
    const b = computeFeatureMatrix(c, ['mom', 'trend', 'vol', 'cal', 'ext']).filter(Boolean) as number[][];
    expect(a[0]).toHaveLength(15);
    expect(featureNames(DEFAULT_GROUPS)).toHaveLength(15);
    expect(b[0].length).toBeGreaterThan(15);
    expect(b.every((r) => r.every(Number.isFinite))).toBe(true);
  });

  it('a explicação soma exatamente o logit do modelo', () => {
    const X = Array.from({ length: 200 }, (_, i) => [Math.sin(i), Math.cos(i * 0.7), (i % 5) - 2]);
    const y = X.map((r) => (r[0] + r[2] * 0.3 > 0 ? 1 : 0));
    const m = new LogisticModel().fit(X, y);
    const ex = m.explain(X[10]);
    expect(1 / (1 + Math.exp(-ex.logit))).toBeCloseTo(m.predict(X[10]), 10);
    expect(ex.items).toHaveLength(3);
  });
});
