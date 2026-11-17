import type { Candle } from '../deriv/market.js';
import {
  adx, atr, bollinger, cci, donchianPos, ema, macd, rsi, stochK, streak, williamsR, zscore,
} from '../indicators/index.js';

/** Grupos de ferramentas que a Aegis IA pode ligar ou desligar. */
export type GroupId = 'mom' | 'trend' | 'vol' | 'cal' | 'ext';

export interface GroupInfo {
  id: GroupId;
  label: string;
  what: string;
  tools: string[];
}

export const GROUPS: GroupInfo[] = [
  { id: 'mom', label: 'Momento', what: 'Para onde o preço andou nas últimas velas e se está esticado.', tools: ['Variação em 1, 3, 5 e 10 velas', 'RSI 14', 'Estocástico %K'] },
  { id: 'trend', label: 'Tendência', what: 'Direção e força do movimento.', tools: ['MACD (histograma)', 'Médias EMA 9 × EMA 21'] },
  { id: 'vol', label: 'Volatilidade e formato', what: 'Quão agitado está o mercado e como a vela fechou.', tools: ['Bandas de Bollinger %B', 'ATR', 'Corpo e pavios da vela'] },
  { id: 'cal', label: 'Calendário', what: 'Hora do dia (sessões da Ásia, Europa e Nova York).', tools: ['Hora (seno e cosseno)'] },
  { id: 'ext', label: 'Extras', what: 'Indicadores adicionais de reversão e de força.', tools: ['ADX 14', 'CCI 20', 'Williams %R 14', 'Canal de Donchian 20', 'Z-score 50', 'Variação em 30 velas', 'Sequência de velas'] },
];

/** Conjunto da versão 1.1 (o que o motor usava antes da bancada). */
export const DEFAULT_GROUPS: GroupId[] = ['mom', 'trend', 'vol', 'cal'];

interface Ctx {
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  t: number[];
  atr: number[];
  m: <T>(key: string, f: () => T) => T;
}

interface Def {
  name: string;
  group: GroupId;
  at: (x: Ctx, i: number) => number;
}

const EPS = 1e-12;
const hourAngle = (x: Ctx, i: number) => ((x.t[i] % 86400) / 86400) * 2 * Math.PI;
const range = (x: Ctx, i: number) => x.h[i] - x.l[i] + EPS;

/** A ordem aqui define a ordem das colunas. */
const DEFS: Def[] = [
  { name: 'ret1/ATR', group: 'mom', at: (x, i) => (x.c[i] - x.c[i - 1]) / x.atr[i] },
  { name: 'ret3/ATR', group: 'mom', at: (x, i) => (x.c[i] - x.c[i - 3]) / x.atr[i] },
  { name: 'ret5/ATR', group: 'mom', at: (x, i) => (x.c[i] - x.c[i - 5]) / x.atr[i] },
  { name: 'ret10/ATR', group: 'mom', at: (x, i) => (x.c[i] - x.c[i - 10]) / x.atr[i] },
  { name: 'RSI14', group: 'mom', at: (x, i) => x.m('rsi', () => rsi(x.c, 14))[i] / 100 - 0.5 },
  { name: 'Stoch %K', group: 'mom', at: (x, i) => x.m('stoch', () => stochK(x.h, x.l, x.c, 14))[i] / 100 - 0.5 },

  { name: 'MACD hist/ATR', group: 'trend', at: (x, i) => x.m('macd', () => macd(x.c).hist)[i] / x.atr[i] },
  { name: 'EMA9-EMA21/ATR', group: 'trend', at: (x, i) => (x.m('e9', () => ema(x.c, 9))[i] - x.m('e21', () => ema(x.c, 21))[i]) / x.atr[i] },

  {
    name: 'Bollinger %B',
    group: 'vol',
    at: (x, i) => {
      const b = x.m('bb', () => bollinger(x.c, 20, 2));
      const bw = b.upper[i] - b.lower[i];
      return bw > 0 ? (x.c[i] - b.lower[i]) / bw - 0.5 : 0;
    },
  },
  { name: 'corpo/range', group: 'vol', at: (x, i) => (x.c[i] - x.o[i]) / range(x, i) },
  { name: 'pavio sup.', group: 'vol', at: (x, i) => (x.h[i] - Math.max(x.o[i], x.c[i])) / range(x, i) },
  { name: 'pavio inf.', group: 'vol', at: (x, i) => (Math.min(x.o[i], x.c[i]) - x.l[i]) / range(x, i) },
  { name: 'log(ATR/preço)', group: 'vol', at: (x, i) => Math.log(x.atr[i] / x.c[i]) },

  { name: 'hora (sin)', group: 'cal', at: (x, i) => Math.sin(hourAngle(x, i)) },
  { name: 'hora (cos)', group: 'cal', at: (x, i) => Math.cos(hourAngle(x, i)) },

  { name: 'ADX14', group: 'ext', at: (x, i) => x.m('adx', () => adx(x.h, x.l, x.c, 14))[i] / 100 - 0.25 },
  { name: 'CCI20', group: 'ext', at: (x, i) => x.m('cci', () => cci(x.h, x.l, x.c, 20))[i] / 200 },
  { name: 'Williams %R', group: 'ext', at: (x, i) => x.m('wr', () => williamsR(x.h, x.l, x.c, 14))[i] / 100 + 0.5 },
  { name: 'Donchian20', group: 'ext', at: (x, i) => x.m('dc', () => donchianPos(x.h, x.l, x.c, 20))[i] - 0.5 },
  { name: 'Z-score50', group: 'ext', at: (x, i) => x.m('z', () => zscore(x.c, 50))[i] },
  { name: 'ret30/ATR', group: 'ext', at: (x, i) => (x.c[i] - x.c[i - 30]) / x.atr[i] },
  { name: 'Sequência', group: 'ext', at: (x, i) => Math.max(-6, Math.min(6, x.m('streak', () => streak(x.c))[i])) / 3 },
];

const defsFor = (groups: GroupId[]) => DEFS.filter((d) => groups.includes(d.group));

export const featureNames = (groups: GroupId[] = DEFAULT_GROUPS): string[] => defsFor(groups).map((d) => d.name);

/** Nomes do conjunto padrão (compatibilidade). */
export const FEATURE_NAMES = featureNames(DEFAULT_GROUPS);

/** Matriz de features por vela. null = aquecimento ou vela degenerada. Usa só dados até a vela i. */
export function computeFeatureMatrix(candles: Candle[], groups: GroupId[] = DEFAULT_GROUPS): (number[] | null)[] {
  const defs = defsFor(groups);
  const cache = new Map<string, unknown>();
  const c = candles.map((k) => k.close);
  const h = candles.map((k) => k.high);
  const l = candles.map((k) => k.low);
  const x: Ctx = {
    o: candles.map((k) => k.open),
    h,
    l,
    c,
    t: candles.map((k) => k.time),
    atr: atr(h, l, c, 14),
    m: <T>(key: string, f: () => T): T => {
      if (!cache.has(key)) cache.set(key, f());
      return cache.get(key) as T;
    },
  };
  return candles.map((_, i) => {
    const a = x.atr[i];
    if (!(a > 0)) return null;
    const row = defs.map((d) => d.at(x, i));
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
export function buildDataset(candles: Candle[], horizon: number, groups: GroupId[] = DEFAULT_GROUPS): Dataset {
  const F = computeFeatureMatrix(candles, groups);
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
export function latestFeatures(candles: Candle[], groups: GroupId[] = DEFAULT_GROUPS): number[] | null {
  const F = computeFeatureMatrix(candles, groups);
  return F[F.length - 1];
}
