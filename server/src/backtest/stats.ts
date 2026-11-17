// A matemática "fiel companheira": tudo que separa sorte de vantagem real.

/** Retorno líquido por unidade (payout/stake - 1). Ex.: payout 18.27 / stake 10 -> 0.827 */
export const ratioFromPayout = (payout: number, stake: number) => payout / stake - 1;

/** Win rate mínimo para empatar. */
export const breakEvenWinRate = (ratio: number) => 1 / (1 + ratio);

/** Esperança de lucro por unidade apostada. */
export const expectedValue = (p: number, ratio: number) => p * ratio - (1 - p);

/** Fração de Kelly (0 se não há vantagem). Use no máximo 1/4 dela, e nunca > 2% da banca. */
export const kellyFraction = (p: number, ratio: number) =>
  Math.max(0, (p * ratio - (1 - p)) / ratio);

function erf(x: number): number {
  // Abramowitz-Stegun 7.1.26
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return s * y;
}

export const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Intervalo de Wilson para proporção (melhor que o normal em n pequeno). */
export function wilson(wins: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

/** p-valor unilateral de H0: win rate verdadeiro <= p0 (aproximação normal). */
export function pValueAbove(wins: number, n: number, p0: number): number {
  if (n === 0) return 1;
  const z = (wins / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);
  return 1 - normalCdf(z);
}

/** Nº de operações necessárias para distinguir p1 de p0 (α=5% unilateral, poder 80%). */
export function sampleSizeToDetect(p0: number, p1: number, zAlpha = 1.645, zBeta = 0.842): number {
  if (p1 <= p0) return Infinity;
  const num = zAlpha * Math.sqrt(p0 * (1 - p0)) + zBeta * Math.sqrt(p1 * (1 - p1));
  return Math.ceil((num / (p1 - p0)) ** 2);
}

/** Maior sequência esperada de derrotas em n operações com prob. de derrota q. */
export const expectedLongestStreak = (n: number, q: number) =>
  q <= 0 || q >= 1 ? 0 : Math.log(n) / Math.log(1 / q);

export interface Trade {
  time: number;
  side: 'CALL' | 'PUT';
  prob: number; // prob. de alta estimada pelo modelo
  win: boolean;
  pnl: number; // em unidades de stake
}

export type Verdict = 'APTO_PARA_DEMO' | 'PROMISSOR_INSUFICIENTE' | 'SEM_EDGE';

export interface Summary {
  trades: number;
  wins: number;
  winRate: number;
  ci95: [number, number];
  breakEven: number;
  evPerTrade: number;
  totalPnl: number;
  maxDrawdown: number;
  pValue: number;
  alpha: number;
  /** operações necessárias para confirmar a vantagem observada */
  tradesNeeded: number | null;
  verdict: Verdict;
  equity: number[];
}

export const MIN_TRADES_FOR_VERDICT = 300;

/**
 * Gate estatístico. APTO só se:
 *  - n >= 300, e
 *  - limite inferior do IC95% (Wilson) > win rate de empate, e
 *  - p-valor < alpha (já corrigido por múltiplos testes).
 */
export function summarize(trades: Trade[], ratio: number, alpha = 0.05): Summary {
  const n = trades.length;
  const wins = trades.filter((t) => t.win).length;
  const winRate = n ? wins / n : 0;
  const breakEven = breakEvenWinRate(ratio);
  const ci95 = wilson(wins, n);
  const pValue = pValueAbove(wins, n, breakEven);

  let eq = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equity = [0];
  for (const t of trades) {
    eq += t.pnl;
    equity.push(eq);
    peak = Math.max(peak, eq);
    maxDrawdown = Math.max(maxDrawdown, peak - eq);
  }

  let verdict: Verdict = 'SEM_EDGE';
  if (n >= MIN_TRADES_FOR_VERDICT && ci95[0] > breakEven && pValue < alpha) {
    verdict = 'APTO_PARA_DEMO';
  } else if (winRate > breakEven) {
    verdict = 'PROMISSOR_INSUFICIENTE';
  }

  const tradesNeeded = winRate > breakEven ? sampleSizeToDetect(breakEven, winRate) : null;

  return {
    trades: n,
    wins,
    winRate,
    ci95,
    breakEven,
    evPerTrade: n ? eq / n : 0,
    totalPnl: eq,
    maxDrawdown,
    pValue,
    alpha,
    tradesNeeded: tradesNeeded !== null && Number.isFinite(tradesNeeded) ? tradesNeeded : null,
    verdict,
    equity,
  };
}
