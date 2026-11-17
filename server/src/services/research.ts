import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AEGIS_ALPHA_DEFAULTS, walkForward } from '../ai/aegis.js';
import { breakEvenWinRate } from '../backtest/stats.js';
import { derivPublic } from '../deriv/client.js';
import { getCandles, getPayoutQuote } from '../deriv/market.js';
import { generateCandles } from '../sim/randomWalk.js';

export interface ResearchParams {
  symbol: string;
  granularity: number;
  durationMin: number;
  count: number;
  threshold: number;
  trainSize: number;
  testSize: number;
}

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const logFile = path.join(dataDir, 'research-log.json');

interface LogEntry {
  at: string;
  symbol: string;
  granularity: number;
  durationMin: number;
  threshold: number;
  trades: number;
  winRate: number;
  pValue: number;
}

export function readLog(): LogEntry[] {
  try {
    return JSON.parse(fs.readFileSync(logFile, 'utf8'));
  } catch {
    return [];
  }
}

function appendLog(e: LogEntry) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(logFile, JSON.stringify([...readLog(), e], null, 2));
}

export function resetLog() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(logFile, '[]');
}

export const defaultParams = (symbol: string): ResearchParams => ({
  symbol,
  count: 8000,
  ...AEGIS_ALPHA_DEFAULTS,
});

export async function runResearch(p: ResearchParams) {
  const horizon = Math.max(1, Math.round((p.durationMin * 60) / p.granularity));
  const [candles, quote] = await Promise.all([
    getCandles(derivPublic, p.symbol, p.granularity, p.count),
    getPayoutQuote(derivPublic, p.symbol, p.durationMin),
  ]);

  // Sem cotação real, assume 85% e AVISA (o resultado não vale como prova).
  const payoutRatio = quote?.ratio ?? 0.85;
  const payoutAssumed = !quote;

  // Correção de Bonferroni: cada estudo extra aumenta a chance de um "falso positivo" por sorte.
  const trials = readLog().length + 1;
  const alpha = 0.05 / trials;

  const wfOpts = {
    horizon,
    trainSize: p.trainSize,
    testSize: p.testSize,
    threshold: p.threshold,
    payoutRatio,
    alpha,
  };
  const real = walkForward(candles, wfOpts);

  // PLACEBO: mesmo pipeline, mesmos parâmetros, em passeio aleatório puro.
  // Se aparecer edge aqui, existe vazamento de dados no código.
  const placebo = walkForward(
    generateCandles(candles.length, { seed: Date.now() % 100000, granularity: p.granularity }),
    wfOpts,
  );

  appendLog({
    at: new Date().toISOString(),
    symbol: p.symbol,
    granularity: p.granularity,
    durationMin: p.durationMin,
    threshold: p.threshold,
    trades: real.summary.trades,
    winRate: real.summary.winRate,
    pValue: real.summary.pValue,
  });

  return {
    params: p,
    horizon,
    candles: candles.length,
    from: candles[0]?.time ?? null,
    to: candles[candles.length - 1]?.time ?? null,
    payoutRatio,
    payoutAssumed,
    breakEven: breakEvenWinRate(payoutRatio),
    trials,
    alpha,
    real: { ...real, trades: real.trades.slice(-200) }, // evita payload gigante
    placebo: { summary: placebo.summary, folds: placebo.folds },
  };
}
