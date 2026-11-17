import type { GroupId } from '../ai/features.js';
import type { Candle } from '../deriv/market.js';
import type { Thought } from './thoughts.js';

export interface WatchItem {
  symbol: string;
  name: string;
  granularity: number; // s
  durationMin: number;
  baseThreshold: number;
  /** ferramentas (indicadores) em uso; ausente = conjunto padrão da v1.1 */
  groups?: GroupId[];
  setId?: string;
}

export type SignalStatus = 'open' | 'win' | 'loss' | 'void';

export interface Signal {
  id: string;
  symbol: string;
  side: 'CALL' | 'PUT';
  /** probabilidade de ALTA estimada pelo modelo */
  prob: number;
  /** |prob - 0.5| */
  confidence: number;
  /** abertura da vela de entrada (epoch s) */
  entryTime: number;
  /** momento do sinal = fechamento da vela de entrada */
  issuedAt: number;
  /** momento da liquidação = issuedAt + horizonte */
  expiresAt: number;
  entryPrice: number;
  exitPrice?: number;
  status: SignalStatus;
  payoutRatio: number;
  /** em unidades de stake: +ratio se ganhou, -1 se perdeu, 0 se anulado */
  pnl?: number;
  settledAt?: number;
  threshold: number;
  /** valor em R$ (carteira fictícia) reservado na emissão */
  stake?: number;
  /** as 3 variáveis que mais pesaram na decisão (contribuição ao logit) */
  why?: { feature: string; c: number }[];
}

export type EventKind = 'start' | 'resume' | 'retrain' | 'backfill' | 'backtest' | 'threshold' | 'signal' | 'settled';

export interface LearnEvent {
  at: number; // epoch s
  kind: EventKind;
  text: string;
}

export interface PersistState {
  signals: Signal[];
  events: LearnEvent[];
  threshold: number;
  retrains: number;
  adaptAnchor: number;
  createdAt: number;
  /** quantos treinos (builds) este modelo já teve, somando todas as sessões */
  builds: number;
  /** última vez que o motor esteve ligado (epoch s): base da retomada após desligar o PC */
  lastSeen: number;
  /** acerto retroativo a cada revalidação: mostra a evolução build a build */
  validations?: { at: number; build: number; n: number; winRate: number; breakEven: number }[];
  /** pré-alertas emitidos e se foram confirmados no fechamento da vela */
  preAlerts?: PreAlert[];
}

/** Prévia do próximo sinal, calculada sobre a vela AINDA em formação (pode mudar até o fechamento). */
export interface Preview {
  candleTime: number; // abertura da vela em formação
  closeAt: number; // quando fecha (e o sinal nasce)
  prob: number;
  side: 'CALL' | 'PUT' | null;
  threshold: number;
  /** um sinal pode abrir no fechamento (não há outro aberto, ou ele vence até lá) */
  canOpen: boolean;
  blockedUntil: number | null;
}

export interface PreAlert {
  time: number; // vela a que se refere
  side: 'CALL' | 'PUT';
  prob: number;
  outcome?: 'confirmado' | 'invertido' | 'sem sinal';
}

export type EngineEvent =
  | { type: 'tick'; symbol: string; candle: Candle; preview?: Preview | null }
  | { type: 'thought'; symbol: string; thought: Thought }
  | { type: 'update'; symbol: string; reason: 'candle' | 'signal' | 'settled' | 'learning' | 'status' | 'research' | 'version' };

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

export interface BandStat {
  label: string;
  retro: { n: number; winRate: number } | null;
  live: { n: number; winRate: number } | null;
}
