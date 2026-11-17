import { breakEvenWinRate, kellyFraction } from '../backtest/stats.js';
import { rng } from '../sim/randomWalk.js';

export type RiskProfile = 'conservador' | 'moderado' | 'agressivo';

/** cap = teto do valor por entrada (% da banca) · loss = stop padrão do dia (% da banca) */
export const PROFILES: Record<RiskProfile, { cap: number; loss: number }> = {
  conservador: { cap: 0.5, loss: 3 },
  moderado: { cap: 1, loss: 5 },
  agressivo: { cap: 2, loss: 8 },
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface PlanInput {
  balance: number;
  profile: RiskProfile;
  payoutRatio: number;
  /** acerto estimado pela IA (retroativo ou ao vivo) */
  winRate: number;
  ci95: [number, number];
  n: number;
  stopLossPct?: number;
  stopGainPct?: number;
  /** quantas operações a IA costuma dar no período planejado */
  opsBudget?: number;
}

export interface Plan {
  mode: 'validado' | 'estudo';
  stake: number;
  stakePct: number;
  breakEven: number;
  /** esperança por operação, em R$, com o acerto estimado */
  evPerTrade: number;
  kellyFull: number;
  stopLoss: number;
  stopGain: number;
  stopLossPct: number;
  stopGainPct: number;
  /** quantas derrotas seguidas fecham o dia no stop loss */
  lossesToStop: number;
  recommendedOps: number;
  sim: { pGain: number; pLoss: number; pNeither: number; avgResult: number; avgOps: number };
  reasons: string[];
  warnings: string[];
}

/** Monte Carlo: chance de bater o stop gain, o stop loss ou terminar o período sem nenhum. */
export function simulateSession(o: {
  p: number;
  ratio: number;
  stake: number;
  stopGain: number;
  stopLoss: number;
  ops: number;
  runs?: number;
  seed?: number;
}) {
  const runs = o.runs ?? 4000;
  const rand = rng(o.seed ?? 7);
  let gain = 0;
  let loss = 0;
  let none = 0;
  let sum = 0;
  let opsSum = 0;
  for (let r = 0; r < runs; r++) {
    let res = 0;
    let k = 0;
    for (; k < o.ops; k++) {
      res += rand() < o.p ? o.stake * o.ratio : -o.stake;
      if (res >= o.stopGain) {
        gain++;
        k++;
        break;
      }
      if (res <= -o.stopLoss) {
        loss++;
        k++;
        break;
      }
    }
    if (res > -o.stopLoss && res < o.stopGain) none++;
    sum += res;
    opsSum += k;
  }
  return { pGain: gain / runs, pLoss: loss / runs, pNeither: none / runs, avgResult: sum / runs, avgOps: opsSum / runs };
}

/**
 * Valor de entrada e limites do dia para o saldo informado.
 *  - Com vantagem VALIDADA (n ≥ 100 e IC95% acima do empate): 1/4 de Kelly sobre o limite inferior, até o teto do perfil.
 *  - Sem vantagem comprovada (o caso de hoje): "modo estudo", metade do teto do perfil.
 * Stops limitam o tamanho da perda; não mudam o sinal da esperança matemática.
 */
export function buildPlan(i: PlanInput): Plan {
  const prof = PROFILES[i.profile];
  const be = breakEvenWinRate(i.payoutRatio);
  const proven = i.n >= 100 && i.ci95[0] > be;
  const kellyFull = kellyFraction(i.winRate, i.payoutRatio);
  const reasons: string[] = [];
  const warnings: string[] = [];

  let pct: number;
  if (proven) {
    const kq = (kellyFraction(i.ci95[0], i.payoutRatio) / 4) * 100;
    pct = clamp(kq, 0.25, prof.cap);
    reasons.push(`Vantagem validada: ¼ de Kelly sobre o limite inferior do acerto, limitado a ${prof.cap}% da banca.`);
  } else {
    pct = prof.cap / 2;
    reasons.push(`Sem vantagem comprovada (acerto ${(i.winRate * 100).toFixed(1)}% contra ${(be * 100).toFixed(1)}% de empate): modo estudo, metade do teto de ${prof.cap}%.`);
  }

  let stake = round2((i.balance * pct) / 100);
  if (stake < 1 && i.balance >= 1) {
    stake = 1;
    warnings.push(`Banca pequena: o mínimo de R$ 1,00 já é ${((1 / i.balance) * 100).toFixed(1)}% do saldo.`);
  }
  stake = Math.min(stake, i.balance);
  const stakePct = i.balance > 0 ? (stake / i.balance) * 100 : 0;

  const stopLossPct = i.stopLossPct ?? prof.loss;
  const stopGainPct = i.stopGainPct ?? stopLossPct;
  const stopLoss = round2((i.balance * stopLossPct) / 100);
  const stopGain = round2((i.balance * stopGainPct) / 100);
  const lossesToStop = stake > 0 ? Math.floor(stopLoss / stake) : 0;

  const p = clamp(i.winRate, 0.35, 0.7);
  const evPerTrade = round2(stake * (p * i.payoutRatio - (1 - p)) * 100) / 100;
  if (evPerTrade < 0) {
    warnings.push(
      `Esperança negativa: a cada R$ 100,00 apostados, o esperado é perder R$ ${Math.abs((evPerTrade / Math.max(stake, 0.01)) * 100).toFixed(2).replace('.', ',')}. Stops limitam o tamanho da perda, não mudam isso.`,
    );
  }
  if (i.balance < 50) warnings.push('Saldo baixo: poucas entradas esgotam o stop do dia.');

  const ops = Math.max(1, Math.round(i.opsBudget ?? 12));
  const sim = simulateSession({ p, ratio: i.payoutRatio, stake, stopGain, stopLoss, ops, seed: Math.round(i.balance * 100 + p * 1000) });

  return {
    mode: proven ? 'validado' : 'estudo',
    stake,
    stakePct,
    breakEven: be,
    evPerTrade,
    kellyFull,
    stopLoss,
    stopGain,
    stopLossPct,
    stopGainPct,
    lossesToStop,
    recommendedOps: ops,
    sim,
    reasons,
    warnings,
  };
}
