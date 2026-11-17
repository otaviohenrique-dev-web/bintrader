import type { Candle } from '../deriv/market.js';
import { summarize, type Summary, type Trade } from '../backtest/stats.js';
import { buildDataset, DEFAULT_GROUPS, featureNames, type GroupId } from './features.js';
import { LogisticModel } from './model.js';

/**
 * AegisAI Alpha — configuração padrão ("nasce treinada" = pré-treina no histórico
 * baixado da Deriv e só opera se passar no gate estatístico).
 *
 *  - Velas de 5 min, expiração de 15 min (3 velas): a Deriv não oferta forex < 15 min.
 *  - Só entra quando a probabilidade se afasta de 50% por `threshold` (seletividade).
 *  - Uma posição por vez (sem sobreposição), como na operação real.
 */
export const AEGIS_ALPHA_DEFAULTS = {
  granularity: 300,
  durationMin: 15,
  threshold: 0.03,
  trainSize: 2000,
  testSize: 250,
};

/** Identidade do agente. "1.1" = 2ª geração do modelo; "Alpha" = estágio de maturidade (em testes). */
export const AEGIS_MODEL = {
  platform: 'OrderFlow Lab',
  name: 'Aegis IA',
  version: '1.1',
  stage: 'Alpha',
  algorithm: 'Regressão logística com regularização L2',
};

export interface WalkForwardOptions {
  horizon: number; // em velas
  trainSize: number; // velas
  testSize: number; // velas
  threshold: number;
  payoutRatio: number;
  alpha?: number;
  /** ferramentas (grupos de indicadores) ligadas; padrão = conjunto da v1.1 */
  groups?: GroupId[];
}

export interface WalkForwardResult {
  summary: Summary;
  trades: Trade[];
  folds: number;
  /** pesos do último modelo, para interpretabilidade */
  weights: { feature: string; weight: number }[];
}

/**
 * Walk-forward com purga: o treino de cada janela termina `horizon` velas antes
 * do início do teste, para que nenhum rótulo de treino "enxergue" o futuro do teste.
 *
 * Implementado como gerador (um `yield` por janela) para poder rodar em lotes
 * sem travar o servidor — veja walkForwardAsync.
 */
export function* walkForwardGen(
  candles: Candle[],
  o: WalkForwardOptions,
): Generator<void, WalkForwardResult, void> {
  const groups = o.groups ?? DEFAULT_GROUPS;
  const ds = buildDataset(candles, o.horizon, groups);
  const trades: Trade[] = [];
  let folds = 0;
  let lastModel: LogisticModel | null = null;

  if (ds.idx.length === 0) {
    return { summary: summarize([], o.payoutRatio, o.alpha), trades, folds, weights: [] };
  }

  let testStart = ds.idx[0] + o.trainSize;
  const lastIdx = ds.idx[ds.idx.length - 1];
  let nextFree = -Infinity;

  while (testStart <= lastIdx) {
    const testEnd = testStart + o.testSize;
    const trainLo = testStart - o.trainSize;
    const trainHi = testStart - o.horizon - 1; // purga

    const tr: number[] = [];
    for (let r = 0; r < ds.idx.length; r++) {
      if (ds.idx[r] >= trainLo && ds.idx[r] <= trainHi) tr.push(r);
    }
    if (tr.length >= 200) {
      const model = new LogisticModel().fit(
        tr.map((r) => ds.X[r]),
        tr.map((r) => ds.y[r]),
      );
      lastModel = model;
      folds++;
      for (let r = 0; r < ds.idx.length; r++) {
        const i = ds.idx[r];
        if (i < testStart || i >= testEnd || i < nextFree) continue;
        const p = model.predict(ds.X[r]);
        let side: 'CALL' | 'PUT' | null = null;
        if (p >= 0.5 + o.threshold) side = 'CALL';
        else if (p <= 0.5 - o.threshold) side = 'PUT';
        if (!side) continue;
        const win = side === 'CALL' ? ds.y[r] === 1 : candles[i + o.horizon].close < candles[i].close;
        trades.push({
          time: ds.times[r],
          side,
          prob: p,
          win,
          pnl: win ? o.payoutRatio : -1,
        });
        nextFree = i + o.horizon;
      }
    }
    testStart = testEnd;
    yield;
  }

  return {
    summary: summarize(trades, o.payoutRatio, o.alpha),
    trades,
    folds,
    weights: lastModel
      ? featureNames(groups).map((f, j) => ({ feature: f, weight: lastModel!.w[j] }))
      : [],
  };
}

export function walkForward(candles: Candle[], o: WalkForwardOptions): WalkForwardResult {
  const g = walkForwardGen(candles, o);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** Mesma coisa, mas devolve o controle ao event loop entre janelas (servidor segue responsivo). */
export async function walkForwardAsync(
  candles: Candle[],
  o: WalkForwardOptions,
): Promise<WalkForwardResult> {
  const g = walkForwardGen(candles, o);
  let r = g.next();
  while (!r.done) {
    await new Promise<void>((res) => setImmediate(res));
    r = g.next();
  }
  return r.value;
}
