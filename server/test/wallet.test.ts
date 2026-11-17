import { describe, expect, it } from 'vitest';
import { applySettlement, freshWallet, stakeFor, walletSummary, type SettledLike } from '../src/engine/wallet.js';
import { paceStats } from '../src/engine/metrics.js';
import { classify, offersIntraday } from '../src/assets/catalog.js';
import { parseDuration } from '../src/deriv/market.js';

const sig = (id: string, status: 'win' | 'loss', over: Partial<SettledLike> = {}): SettledLike => ({
  id,
  symbol: 'frxEURUSD',
  side: 'CALL',
  status,
  payoutRatio: 0.8,
  settledAt: 1000,
  ...over,
});

describe('carteira fictícia em R$', () => {
  it('começa com a banca inicial e stake de 1%', () => {
    const w = freshWallet(1000);
    expect(w.balance).toBe(1000);
    expect(stakeFor(w)).toBe(10);
  });

  it('WIN soma stake × payout; LOSS subtrai o stake', () => {
    const w = freshWallet(1000);
    applySettlement(w, sig('a', 'win', { stake: 10 }), 'EUR/USD');
    expect(w.balance).toBe(1008);
    applySettlement(w, sig('b', 'loss', { stake: 10 }), 'EUR/USD');
    expect(w.balance).toBe(998);
  });

  it('é idempotente: o mesmo sinal não conta duas vezes', () => {
    const w = freshWallet(1000);
    applySettlement(w, sig('a', 'loss', { stake: 10 }), 'EUR/USD');
    expect(applySettlement(w, sig('a', 'loss', { stake: 10 }), 'EUR/USD')).toBeNull();
    expect(w.balance).toBe(990);
    expect(w.ledger).toHaveLength(1);
  });

  it('stake em % acompanha a banca (juros compostos)', () => {
    const w = freshWallet(1000);
    applySettlement(w, sig('a', 'win'), 'x'); // stake 10 → +8
    expect(stakeFor(w)).toBeCloseTo(10.08, 2);
  });

  it('nunca fica negativa e avisa quando zera', () => {
    const w = freshWallet(100, { stakeMode: 'fixed', stakePercent: 1, stakeFixed: 60 });
    applySettlement(w, sig('a', 'loss'), 'x');
    applySettlement(w, sig('b', 'loss'), 'x');
    expect(w.balance).toBe(0);
    expect(walletSummary(w).broke).toBe(true);
    expect(stakeFor(w)).toBe(0);
  });

  it('ignora sinais anteriores ao reinício da carteira', () => {
    const w = freshWallet(1000, undefined, 5000);
    expect(applySettlement(w, sig('old', 'win', { settledAt: 4000 }), 'x')).toBeNull();
    expect(w.balance).toBe(1000);
  });

  it('resumo: lucro, ROI e maior queda', () => {
    const w = freshWallet(1000);
    applySettlement(w, sig('a', 'win', { stake: 100 }), 'x'); // 1080
    applySettlement(w, sig('b', 'loss', { stake: 100 }), 'x'); // 980
    const s = walletSummary(w, 2000);
    expect(s.pnl).toBe(-20);
    expect(s.roi).toBeCloseTo(-0.02, 5);
    expect(s.maxDrawdown).toBeCloseTo(100 / 1080, 5);
  });
});

describe('ritmo de operação', () => {
  const G = 300;
  it('detecta operar "uma atrás da outra" e viés direcional', () => {
    const items = [0, 1, 2, 3].map((i) => ({ issuedAt: i * 900, expiresAt: (i + 1) * 900, side: 'PUT' as const }));
    const p = paceStats(items, G)!;
    expect(p.backToBackPct).toBe(1);
    expect(p.inPositionPct).toBe(1);
    expect(p.callPct).toBe(0);
  });
  it('mede a espera quando há pausa entre sinais', () => {
    const p = paceStats(
      [
        { issuedAt: 0, expiresAt: 900, side: 'CALL' },
        { issuedAt: 2700, expiresAt: 3600, side: 'PUT' },
      ],
      G,
    )!;
    expect(p.backToBackPct).toBe(0);
    expect(p.avgIdleMin).toBe(30);
    expect(p.callPct).toBe(0.5);
  });
});

describe('compatibilidade de ativos', () => {
  it('interpreta durações da Deriv', () => {
    expect(parseDuration('15m')).toBe(900);
    expect(parseDuration('1h')).toBe(3600);
    expect(parseDuration('5t')).toBeNull();
  });

  const info = { symbol: 'frxEURUSD', name: 'EUR/USD', market: 'forex', submarket: 'major_pairs', isOpen: true, suspended: false, pipSize: 0.00001 };
  const intraday = [{ expiryType: 'intraday', minSec: 900, maxSec: 86400 }];
  const quote = (ratio: number) => ({ stake: 10, payout: 10 * (1 + ratio), ratio, breakEven: 1 / (1 + ratio) });

  it('só aceita Rise/Fall intradiário que cobre 15 min', () => {
    expect(offersIntraday(intraday, 900)).toBe(true);
    expect(offersIntraday([{ expiryType: 'daily', minSec: 86400, maxSec: 31536000 }], 900)).toBe(false);
    expect(offersIntraday([{ expiryType: 'intraday', minSec: 3600, maxSec: 86400 }], 900)).toBe(false);
  });

  it('descarta cripto sem 15 min e payout baixo; mantém forex normal', () => {
    expect(classify({ ...info, market: 'cryptocurrency', symbol: 'cryBTCUSD' }, [], null, 0, null).compatible).toBe(false);
    expect(classify(info, intraday, quote(0.56), 2000, null).compatible).toBe(false);
    const ok = classify(info, intraday, quote(0.82), 2000, null);
    expect(ok.compatible).toBe(true);
    expect(ok.tier).toBe('B');
  });

  it('mercado fechado não descarta (só avisa) e OTC recebe ressalva', () => {
    const closed = classify({ ...info, isOpen: false }, intraday, null, 2000, null);
    expect(closed.compatible).toBe(true);
    expect(closed.notes.join()).toContain('fechado');
    expect(classify({ ...info, symbol: 'OTC_NDX' }, intraday, quote(0.82), 2000, null).notes.join()).toContain('OTC');
  });
});
