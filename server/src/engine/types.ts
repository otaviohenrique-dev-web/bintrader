import type { Candle } from '../deriv/market.js';

export interface WatchItem {
  symbol: string;
  name: string;
  granularity: number; // s
  durationMin: number;
  baseThreshold: number;
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
}

export type EventKind = 'start' | 'retrain' | 'backfill' | 'backtest' | 'threshold' | 'signal' | 'settled';

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
}

export type EngineEvent =
  | { type: 'tick'; symbol: string; candle: Candle }
  | { type: 'update'; symbol: string; reason: 'candle' | 'signal' | 'settled' | 'learning' | 'status' };

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
