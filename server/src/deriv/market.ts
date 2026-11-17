import { DerivClient, DerivError } from './client.js';

export interface Candle {
  time: number; // epoch (s) de abertura
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  market: string;
  submarket: string;
  isOpen: boolean;
  suspended: boolean;
  pipSize: number;
}

export interface PayoutQuote {
  stake: number;
  payout: number;
  /** retorno líquido por unidade apostada (ex.: 0.827) */
  ratio: number;
  /** win rate necessário para empatar */
  breakEven: number;
}

export async function getActiveSymbols(c: DerivClient): Promise<SymbolInfo[]> {
  const r = await c.request({ active_symbols: 'brief' });
  return (r.active_symbols as any[]).map((s) => ({
    symbol: s.underlying_symbol,
    name: s.underlying_symbol_name,
    market: s.market,
    submarket: s.submarket,
    isOpen: !!s.exchange_is_open,
    suspended: !!s.is_trading_suspended,
    pipSize: s.pip_size,
  }));
}

/**
 * Baixa até `count` velas FECHADAS (descarta a vela em formação para não
 * contaminar o treino com dado incompleto). Pagina para trás em lotes de 5000.
 */
export async function getCandles(
  c: DerivClient,
  symbol: string,
  granularity: number,
  count: number,
  /** epoch (s) final; omitido = até agora. Usado para baixar histórico mais antigo. */
  endEpoch?: number,
): Promise<Candle[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const byTime = new Map<number, Candle>();
  let end: string | number = endEpoch ?? 'latest';

  // A Deriv devolve páginas curtas (~400–1000 velas; cortam em fins de semana),
  // então pagina para trás até juntar `count`, com teto de páginas por segurança.
  for (let page = 0; byTime.size < count && page < 60; page++) {
    const want = Math.min(5000, count - byTime.size);
    const r = await c.request({
      ticks_history: symbol,
      style: 'candles',
      granularity,
      count: want,
      end,
      adjust_start_time: 1,
    });
    const batch: Candle[] = (r.candles ?? []).map((k: any) => ({
      time: k.epoch,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));
    if (batch.length === 0) break;
    const before = byTime.size;
    for (const k of batch) byTime.set(k.time, k);
    if (byTime.size === before) break;
    end = Math.min(...batch.map((k) => k.time)) - 1;
  }

  return [...byTime.values()]
    .filter((k) => k.time + granularity <= nowSec)
    .sort((a, b) => a.time - b.time)
    .slice(-count);
}

export interface ContractOffer {
  expiryType: string; // tick | intraday | daily
  /** segundos; null quando a duração é em ticks */
  minSec: number | null;
  maxSec: number | null;
}

/** "15m" -> 900, "1h" -> 3600, "1d" -> 86400, "5t" -> null (ticks) */
export function parseDuration(s: string | undefined): number | null {
  const m = /^(\d+)([smhd])$/.exec(s ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

/** Ofertas de CALL (Rise) do ativo, por tipo de expiração. Funciona mesmo com o mercado fechado. */
export async function getCallOffers(c: DerivClient, symbol: string): Promise<ContractOffer[]> {
  try {
    const r = await c.request({ contracts_for: symbol });
    return ((r.contracts_for?.available ?? []) as any[])
      .filter((k) => k.contract_type === 'CALL')
      .map((k) => ({
        expiryType: k.expiry_type,
        minSec: parseDuration(k.min_contract_duration),
        maxSec: parseDuration(k.max_contract_duration),
      }));
  } catch (e) {
    if (e instanceof DerivError) return [];
    throw e;
  }
}

/** Velas mais recentes, INCLUINDO a vela em formação (última). Uma requisição só. */
export async function getRecentCandles(
  c: DerivClient,
  symbol: string,
  granularity: number,
): Promise<Candle[]> {
  const r = await c.request({
    ticks_history: symbol,
    style: 'candles',
    granularity,
    count: 300,
    end: 'latest',
    adjust_start_time: 1,
  });
  return ((r.candles ?? []) as any[])
    .map((k) => ({ time: k.epoch, open: k.open, high: k.high, low: k.low, close: k.close }))
    .sort((a, b) => a.time - b.time);
}

/** Cotação real de payout para um CALL "at-the-money". null = duração não ofertada. */
export async function getPayoutQuote(
  c: DerivClient,
  symbol: string,
  durationMin: number,
  stake = 10,
): Promise<PayoutQuote | null> {
  try {
    const r = await c.request({
      proposal: 1,
      amount: stake,
      basis: 'stake',
      contract_type: 'CALL',
      currency: 'USD',
      duration: durationMin,
      duration_unit: 'm',
      underlying_symbol: symbol,
    });
    const p = r.proposal;
    const ratio = p.payout / p.ask_price - 1;
    return { stake: p.ask_price, payout: p.payout, ratio, breakEven: 1 / (1 + ratio) };
  } catch (e) {
    if (e instanceof DerivError) return null;
    throw e;
  }
}

/** Executa tarefas com concorrência limitada (respeita rate limit da API). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
