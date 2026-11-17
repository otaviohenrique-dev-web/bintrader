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
  toolkit: ToolkitInfo;
  builds: number;
  validations: { at: number; build: number; n: number; winRate: number; breakEven: number }[];
  lastSeen: number;
  resume: { at: number; offlineSec: number; settled: number } | null;
  explain: Explain | null;
  thoughts: Thought[];
  hourNow: HourRating;
  version: { number: number; label: string; since: number };
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

export interface Thought {
  id: number;
  at: number;
  symbol: string;
  kind: 'read' | 'weights' | 'decision' | 'tool' | 'test' | 'result' | 'verdict' | 'version' | 'system';
  text: string;
}

export interface Explain {
  time: number;
  prob: number;
  bias: number;
  items: { feature: string; value: number; z: number; weight: number; contribution: number }[];
}

export interface HourRating {
  rating: 'forte' | 'neutro' | 'fraco' | 'sem dados';
  winRate: number | null;
  n: number;
  diffPp: number;
}

export interface ToolkitInfo {
  granularity: number;
  durationMin: number;
  setId: string;
  groups: string[];
  label: string;
}

export interface Experiment {
  key: string;
  label: string;
  granularity: number;
  durationMin: number;
  setId: string;
  n: number;
  wins: number;
  winRate: number;
  ci95: [number, number];
  breakEven: number;
  pValue: number;
  ev: number;
  marginPp: number;
  significant: boolean;
  at: number;
}

export interface VaultResult {
  key: string;
  label: string;
  n: number;
  winRate: number;
  ci95: [number, number];
  breakEven: number;
  pValue: number;
}

export interface CycleSummary {
  cycle: number;
  at: number;
  tests: number;
  alpha: number;
  aboveBreakEven: number;
  significant: number;
  best: { key: string; label: string; winRate: number; marginPp: number; devN: number } | null;
  vault: { challenger: VaultResult; champion: VaultResult | null; alpha: number; looks: number } | null;
  decision: 'promovida' | 'mantida' | 'atual-e-a-melhor' | 'sem-cofre' | 'sem-dados';
  note: string;
}

export interface VersionRec {
  version: number;
  label: string;
  at: number;
  build: number;
  winRate: number | null;
  n: number | null;
  deltaPp: number;
  toolkit: string;
  note: string;
}

export interface Bench {
  cycles: number;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  running: boolean;
  progress: { i: number; k: number; current: string | null };
  alpha: number;
  tests: number;
  vault: { share: number; looks: number; start: Record<string, number> };
  champion: { key: string; label: string; granularity: number; durationMin: number; setId: string; tf: string };
  experiments: Experiment[];
  history: CycleSummary[];
  versions: VersionRec[];
}

export interface Toolbox {
  timeframes: { sec: number; label: string; trainWindow: number; maxHistory: number }[];
  durations: number[];
  groups: { id: string; label: string; what: string; tools: string[] }[];
  sets: { id: string; label: string; groups: string[] }[];
  experiments: number;
  versionK: number;
}

export interface HourStat {
  hour: number;
  n: number;
  wins: number;
  winRate: number | null;
  ci95: [number, number];
  pnl: number;
  ev: number;
  days: number;
  perHour: number;
}

export interface PlanWindow {
  start: number;
  width: number;
  label: string;
  n: number;
  wins: number;
  winRate: number;
  ci95: [number, number];
  ev: number;
  opsPerWindow: number;
  pValue: number;
  significant: boolean;
  recommendedOps: number;
  stake: number;
  sim: { pGain: number; pLoss: number; pNeither: number; avgResult: number; avgOps: number };
}

export interface PlanData {
  mode: 'validado' | 'estudo';
  stake: number;
  stakePct: number;
  breakEven: number;
  evPerTrade: number;
  kellyFull: number;
  stopLoss: number;
  stopGain: number;
  stopLossPct: number;
  stopGainPct: number;
  lossesToStop: number;
  recommendedOps: number;
  sim: { pGain: number; pLoss: number; pNeither: number; avgResult: number; avgOps: number };
  reasons: string[];
  warnings: string[];
}

export interface PlanResponse {
  symbol: string;
  name: string;
  settings: { balance: number; profile: 'conservador' | 'moderado' | 'agressivo'; stopLossPct: number | null; stopGainPct: number | null };
  profiles: Record<string, { cap: number; loss: number }>;
  reference: { winRate: number; ci95: [number, number]; n: number; source: 'ao vivo' | 'retroativa'; payoutRatio: number; breakEven: number };
  plan: PlanData;
  hours: HourStat[];
  overall: number;
  windows: PlanWindow[];
  nowHour: HourRating;
  tz: string;
}

export type StreamEvent =
  | { type: 'tick'; symbol: string; candle: Candle }
  | { type: 'thought'; symbol: string; thought: Thought }
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

  // bancada e plano
  toolbox: () => http<Toolbox>('/api/toolbox'),
  bench: (symbol: string) => http<Bench>(`/api/bench/${symbol}`),
  benchRun: (symbol: string) => http<{ ok: boolean }>(`/api/bench/${symbol}/run`, { method: 'POST' }),
  plan: (symbol: string, q: { balance: number; profile: string; stopLoss?: number | null; stopGain?: number | null }) =>
    http<PlanResponse>(`/api/plan/${symbol}?balance=${q.balance}&profile=${q.profile}${q.stopLoss ? `&stopLoss=${q.stopLoss}` : ''}${q.stopGain ? `&stopGain=${q.stopGain}` : ''}`),
  planSettings: (b: { balance?: number; profile?: string; stopLossPct?: number | null; stopGainPct?: number | null }) =>
    http<PlanResponse['settings']>('/api/plan/settings', json('POST', b)),
};
