async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body as T;
}

export interface IdealItem {
  criterio: string;
  ideal: string;
  porque: string;
}

export interface MathResult {
  ratio: number;
  breakEven: number;
  houseEdge: number;
  winRate: number;
  evPerUnit: number;
  kelly: number;
  tradesToConfirm: number;
  longestLossStreak500: number;
}

export interface AssetRow {
  symbol: string;
  name: string;
  market: string;
  submarket: string;
  open: boolean;
  payoutRatio: number | null;
  breakEven: number | null;
  isRng: boolean;
  score: number;
  notes: string[];
  metrics: { atrPct: number; vr: number; vrZ: number; ac1Z: number; tieRate: number } | null;
}

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
  tradesNeeded: number | null;
  verdict: 'APTO_PARA_DEMO' | 'PROMISSOR_INSUFICIENTE' | 'SEM_EDGE';
  equity: number[];
}

export interface ResearchResult {
  horizon: number;
  candles: number;
  from: number | null;
  to: number | null;
  payoutRatio: number;
  payoutAssumed: boolean;
  breakEven: number;
  trials: number;
  alpha: number;
  real: { summary: Summary; folds: number; weights: { feature: string; weight: number }[] };
  placebo: { summary: Summary; folds: number };
}

export const api = {
  config: () => http<{ idealProfile: IdealItem[] }>('/api/config'),
  math: (ratio: number, winRate: number) =>
    http<MathResult>(`/api/math?ratio=${ratio}&winRate=${winRate}`),
  assets: (granularity: number, durationMin: number, synthetic: boolean) =>
    http<{ rows: AssetRow[]; cached: boolean }>(
      `/api/assets/profile?granularity=${granularity}&durationMin=${durationMin}&synthetic=${synthetic ? 1 : 0}`,
    ),
  research: (body: Record<string, unknown>) =>
    http<ResearchResult>('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  resetLog: () => http<{ ok: boolean }>('/api/research/log', { method: 'DELETE' }),
};
