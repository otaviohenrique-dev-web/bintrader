import { readJson, writeJson } from './store.js';

/**
 * Carteira FICTÍCIA em R$ (BRL). Dinheiro de simulação: cada sinal liquidado soma (WIN) ou
 * subtrai (LOSS) da banca, com o preço real do mercado e o payout real cotado na emissão.
 * Nada aqui toca em conta de corretora.
 */
export interface WalletSettings {
  stakeMode: 'percent' | 'fixed';
  /** % da banca por sinal (0,1–5) */
  stakePercent: number;
  /** R$ fixos por sinal */
  stakeFixed: number;
}

export interface LedgerEntry {
  id: string;
  symbol: string;
  name: string;
  side: 'CALL' | 'PUT';
  at: number; // epoch s da liquidação
  stake: number;
  payoutRatio: number;
  status: 'win' | 'loss';
  pnl: number; // R$
  balance: number; // saldo após
}

export interface WalletState {
  currency: 'BRL';
  initial: number;
  balance: number;
  peak: number;
  /** só sinais liquidados a partir daqui entram (0 = toda a história) */
  startedAt: number;
  settings: WalletSettings;
  ledger: LedgerEntry[];
}

export interface SettledLike {
  id: string;
  symbol: string;
  side: 'CALL' | 'PUT';
  status: 'win' | 'loss';
  payoutRatio: number;
  stake?: number;
  settledAt?: number;
}

export const WALLET_LIMITS = { minInitial: 100, maxInitial: 1_000_000, minStake: 1, maxPercent: 5, minPercent: 0.1, maxLedger: 5000 };

export const round2 = (v: number) => Math.round(v * 100) / 100;

export function freshWallet(initial = 1000, settings?: WalletSettings, startedAt = 0): WalletState {
  return {
    currency: 'BRL',
    initial,
    balance: initial,
    peak: initial,
    startedAt,
    settings: settings ?? { stakeMode: 'percent', stakePercent: 1, stakeFixed: 10 },
    ledger: [],
  };
}

/** Valor do próximo sinal. Nunca passa do saldo; abaixo de R$ 1 a banca está zerada. */
export function stakeFor(w: WalletState): number {
  if (w.balance < WALLET_LIMITS.minStake) return 0;
  const raw = w.settings.stakeMode === 'percent' ? (w.balance * w.settings.stakePercent) / 100 : w.settings.stakeFixed;
  return Math.min(w.balance, Math.max(WALLET_LIMITS.minStake, round2(raw)));
}

/** Aplica um sinal liquidado. Idempotente por id. Devolve a entrada criada (ou null). */
export function applySettlement(w: WalletState, s: SettledLike, name: string): LedgerEntry | null {
  if (w.ledger.some((l) => l.id === s.id)) return null;
  if (s.settledAt !== undefined && s.settledAt < w.startedAt) return null;
  const stake = Math.min(s.stake ?? stakeFor(w), w.balance);
  const pnl = s.status === 'win' ? round2(stake * s.payoutRatio) : -stake;
  w.balance = Math.max(0, round2(w.balance + pnl));
  w.peak = Math.max(w.peak, w.balance);
  const entry: LedgerEntry = {
    id: s.id,
    symbol: s.symbol,
    name,
    side: s.side,
    at: s.settledAt ?? Math.floor(Date.now() / 1000),
    stake,
    payoutRatio: s.payoutRatio,
    status: s.status,
    pnl,
    balance: w.balance,
  };
  w.ledger.push(entry);
  if (w.ledger.length > WALLET_LIMITS.maxLedger) w.ledger.shift();
  return entry;
}

export function walletSummary(w: WalletState, nowSec = Math.floor(Date.now() / 1000)) {
  const day = new Date(nowSec * 1000);
  day.setHours(0, 0, 0, 0);
  const dayStart = day.getTime() / 1000;
  const today = round2(w.ledger.filter((l) => l.at >= dayStart).reduce((a, l) => a + l.pnl, 0));

  let peak = w.initial;
  let maxDd = 0;
  for (const l of w.ledger) {
    peak = Math.max(peak, l.balance);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - l.balance) / peak : 0);
  }
  const wins = w.ledger.filter((l) => l.status === 'win').length;
  return {
    currency: w.currency,
    initial: w.initial,
    balance: w.balance,
    pnl: round2(w.balance - w.initial),
    roi: (w.balance - w.initial) / w.initial,
    today,
    peak: w.peak,
    maxDrawdown: maxDd,
    stake: stakeFor(w),
    settings: w.settings,
    trades: w.ledger.length,
    wins,
    losses: w.ledger.length - wins,
    broke: w.balance < WALLET_LIMITS.minStake,
    startedAt: w.startedAt,
  };
}

const FILE = 'wallet.json';

/** Carteira persistida em disco (server/data/wallet.json). */
class Wallet {
  private w: WalletState;

  constructor() {
    this.w = readJson<WalletState>(FILE, freshWallet());
  }

  private save() {
    writeJson(FILE, this.w);
  }

  nextStake() {
    return stakeFor(this.w);
  }

  settle(s: SettledLike, name: string) {
    const e = applySettlement(this.w, s, name);
    if (e) this.save();
    return e;
  }

  summary() {
    return walletSummary(this.w);
  }

  ledger(limit = 200) {
    return this.w.ledger.slice(-limit);
  }

  equity() {
    const bal = [this.w.initial, ...this.w.ledger.map((l) => l.balance)];
    const step = Math.max(1, Math.ceil(bal.length / 240));
    return bal.filter((_, i) => i % step === 0 || i === bal.length - 1);
  }

  updateSettings(p: Partial<WalletSettings>) {
    const s = this.w.settings;
    if (p.stakeMode === 'percent' || p.stakeMode === 'fixed') s.stakeMode = p.stakeMode;
    if (typeof p.stakePercent === 'number' && Number.isFinite(p.stakePercent)) {
      s.stakePercent = Math.min(WALLET_LIMITS.maxPercent, Math.max(WALLET_LIMITS.minPercent, p.stakePercent));
    }
    if (typeof p.stakeFixed === 'number' && Number.isFinite(p.stakeFixed)) {
      s.stakeFixed = Math.min(10_000, Math.max(WALLET_LIMITS.minStake, round2(p.stakeFixed)));
    }
    this.save();
  }

  /** Recomeça do zero com novo saldo inicial; sinais antigos não voltam a contar. */
  reset(initial: number) {
    const v = Math.min(WALLET_LIMITS.maxInitial, Math.max(WALLET_LIMITS.minInitial, round2(initial)));
    this.w = freshWallet(v, this.w.settings, Math.floor(Date.now() / 1000));
    this.save();
  }
}

export const wallet = new Wallet();
