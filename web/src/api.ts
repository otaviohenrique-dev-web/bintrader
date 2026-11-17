async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body as T;
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ---- laboratório --------------------------------------------------------

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

// ---- motor de sinais ----------------------------------------------------

export interface WatchItem {
  symbol: string;
  name: string;
  granularity: number;
  durationMin: number;
  baseThreshold: number;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  market: string;
  submarket: string;
  isOpen: boolean;
  suspended: boolean;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  forming?: boolean;
}

export interface Signal {
  id: string;
  symbol: string;
  side: 'CALL' | 'PUT';
  prob: number;
  confidence: number;
  entryTime: number;
  issuedAt: number;
  expiresAt: number;
  entryPrice: number;
  exitPrice?: number;
  status: 'open' | 'win' | 'loss' | 'void';
  payoutRatio: number;
  pnl?: number;
  settledAt?: number;
  threshold: number;
  stake?: number;
}

export interface WalletSummary {
  currency: 'BRL';
  initial: number;
  balance: number;
  pnl: number;
  roi: number;
  today: number;
  peak: number;
  maxDrawdown: number;
  stake: number;
  settings: { stakeMode: 'percent' | 'fixed'; stakePercent: number; stakeFixed: number };
  trades: number;
  wins: number;
  losses: number;
  broke: boolean;
  startedAt: number;
}

export interface LedgerEntry {
  id: string;
  symbol: string;
  name: string;
  side: 'CALL' | 'PUT';
  at: number;
  stake: number;
  payoutRatio: number;
  status: 'win' | 'loss';
  pnl: number;
  balance: number;
}

export interface PaceStats {
  n: number;
  backToBackPct: number;
  avgIdleMin: number;
  inPositionPct: number;
  callPct: number;
}

export interface CatalogRow {
  symbol: string;
  name: string;
  market: string;
  submarket: string;
  open: boolean;
  payoutRatio: number | null;
  breakEven: number | null;
  score: number;
  tier: 'A' | 'B' | 'C' | null;
  compatible: boolean;
  reasons: string[];
  notes: string[];
  candles: number;
  metrics: { atrPct: number; vr: number; vrZ: number; ac1Z: number; tieRate: number } | null;
  isOtc: boolean;
}

export interface CatalogState {
  rows: CatalogRow[];
  at: number | null;
  scanning: boolean;
  error: string | null;
  compat: { granularity: number; durationMin: number; minPayout: number; minCandles: number };
}

export interface AiInfo {
  model: { platform: string; name: string; version: string; stage: string; algorithm: string };
  features: string[];
  limits: Record<string, number>;
  maxWatch: number;
  storage: { file: string; bytes: number; updatedAt: number; purpose: string }[];
  dataDir: string;
}

export interface PerfStats {
  n: number;
  wins: number;
  losses: number;
  winRate: number;
  ci95: [number, number];
  breakEven: number;
  pnl: number;
  pValue: number;
  last50: { n: number; winRate: number } | null;
  streak: { kind: 'W' | 'L'; len: number } | null;
  status: 'coletando' | 'abaixo' | 'inconclusivo' | 'vantagem';
}

export interface RetroTrade {
  time: number;
  side: 'CALL' | 'PUT';
  win: boolean;
  prob: number;
}

export interface LearnEvent {
  at: number;
  kind: 'start' | 'retrain' | 'backfill' | 'backtest' | 'threshold' | 'signal' | 'settled';
  text: string;
}

export interface Snapshot {
  now: number;
  config: WatchItem & { horizon: number };
  wallet: WalletSummary;
  pace: { live: PaceStats | null; retro: PaceStats | null };
  ready: boolean;
  error: string | null;
  stale: boolean;
  candles: Candle[];
  signals: Signal[];
  payoutRatio: number | null;
  breakEven: number;
  lastPrediction: {
    time: number;
    prob: number;
    side: 'CALL' | 'PUT' | null;
    threshold: number;
    reason?: string;
  } | null;
  nextCloseAt: number | null;
  stats: { live: PerfStats; retro: PerfStats | null };
  backtest: {
    at: number;
    candles: number;
    from: number;
    to: number;
    folds: number;
    payoutRatio: number;
    equity: number[];
    trades: RetroTrade[];
  } | null;
  running: boolean;
  learning: {
    historyCandles: number;
    historyTarget: number;
    historyFrom: number | null;
    historyTo: number | null;
    exhausted: boolean;
    trainWindow: number;
    samples: number;
    retrains: number;
    lastTrainAt: number | null;
    threshold: number;
    baseThreshold: number;
    weights: { feature: string; weight: number }[];
    bands: {
      label: string;
      retro: { n: number; winRate: number } | null;
      live: { n: number; winRate: number } | null;
    }[];
  };
  events: LearnEvent[];
}

export type StreamEvent =
  | { type: 'tick'; symbol: string; candle: Candle }
  | { type: 'update'; symbol: string; reason: string };

export const api = {
  // laboratório
  config: () => http<{ idealProfile: IdealItem[] }>('/api/config'),
  math: (ratio: number, winRate: number) =>
    http<MathResult>(`/api/math?ratio=${ratio}&winRate=${winRate}`),
  assets: (granularity: number, durationMin: number, synthetic: boolean) =>
    http<{ rows: AssetRow[]; cached: boolean }>(
      `/api/assets/profile?granularity=${granularity}&durationMin=${durationMin}&synthetic=${synthetic ? 1 : 0}`,
    ),
  research: (body: Record<string, unknown>) => http<ResearchResult>('/api/research', json('POST', body)),
  resetLog: () => http<{ ok: boolean }>('/api/research/log', { method: 'DELETE' }),

  // motor
  symbols: () => http<SymbolInfo[]>('/api/symbols'),
  watchlist: () => http<WatchItem[]>('/api/watchlist'),
  addWatch: (symbol: string) => http<WatchItem[]>('/api/watchlist', json('POST', { symbol })),
  removeWatch: (symbol: string) => http<WatchItem[]>(`/api/watchlist/${symbol}`, { method: 'DELETE' }),
  engine: (symbol: string) => http<Snapshot>(`/api/engine/${symbol}`),

  // catálogo, carteira e perfil da IA
  catalog: () => http<CatalogState>('/api/assets/catalog'),
  refreshCatalog: () => http<{ ok: boolean }>('/api/assets/catalog/refresh', { method: 'POST' }),
  wallet: () => http<{ summary: WalletSummary; ledger: LedgerEntry[]; equity: number[] }>('/api/wallet'),
  walletSettings: (s: Partial<WalletSummary['settings']>) =>
    http<{ summary: WalletSummary }>('/api/wallet/settings', json('POST', s)),
  walletReset: (initial: number) => http<{ summary: WalletSummary }>('/api/wallet/reset', json('POST', { initial })),
  ai: () => http<AiInfo>('/api/ai'),
};
