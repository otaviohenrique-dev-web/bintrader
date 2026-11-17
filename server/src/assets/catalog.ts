import { analyzeAsset, scoreAsset, type AssetMetrics } from './profile.js';
import { derivPublic } from '../deriv/client.js';
import {
  getActiveSymbols,
  getCallOffers,
  getCandles,
  getPayoutQuote,
  mapLimit,
  type ContractOffer,
  type PayoutQuote,
  type SymbolInfo,
} from '../deriv/market.js';

/** Regras de compatibilidade com o Aegis IA (velas M5 · expiração 15 min · Rise/Fall). */
export const COMPAT = {
  granularity: 300,
  durationMin: 15,
  minPayout: 0.65,
  minCandles: 1800,
  markets: ['forex', 'commodities', 'indices', 'cryptocurrency'],
};

/** Existe Rise/Fall INTRADIÁRIO que cobre a expiração (em segundos)? */
export function offersIntraday(offers: ContractOffer[], seconds: number): boolean {
  return offers.some(
    (o) => o.expiryType === 'intraday' && o.minSec !== null && o.maxSec !== null && o.minSec <= seconds && seconds <= o.maxSec,
  );
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
  /** por que foi descartado (vazio se compatível) */
  reasons: string[];
  /** observações que não descartam */
  notes: string[];
  candles: number;
  metrics: AssetMetrics | null;
  isOtc: boolean;
}

export function classify(
  info: SymbolInfo,
  offers: ContractOffer[],
  quote: PayoutQuote | null,
  candles: number,
  metrics: AssetMetrics | null,
): CatalogRow {
  const base = scoreAsset(info, quote, metrics);
  const reasons: string[] = [];
  const notes: string[] = [];
  const isOtc = info.symbol.startsWith('OTC_');

  if (!offersIntraday(offers, COMPAT.durationMin * 60)) reasons.push(`Sem Rise/Fall de ${COMPAT.durationMin} min na Deriv`);
  if (info.suspended) reasons.push('Negociação suspensa');
  if (reasons.length === 0 && candles < COMPAT.minCandles) reasons.push(`Histórico curto (${candles} velas M5)`);
  if (quote && quote.ratio < COMPAT.minPayout) {
    reasons.push(`Payout baixo (${(quote.ratio * 100).toFixed(0)}%): exige ${(quote.breakEven * 100).toFixed(0)}% de acerto`);
  }

  if (reasons.length === 0) {
    if (!info.isOpen) notes.push('Mercado fechado agora');
    if (isOtc) notes.push('Índice OTC: confirme a origem do preço antes de confiar nos resultados');
    if (quote && quote.ratio < 0.75) notes.push('Payout moderado');
    if (metrics && Math.abs(metrics.vrZ) >= 2) notes.push(metrics.vr > 1 ? 'Indício de tendência' : 'Indício de reversão');
  }

  const compatible = reasons.length === 0;
  const score = isOtc ? Math.min(base.score, 70) : base.score;
  const tier: CatalogRow['tier'] = !compatible ? null : quote && quote.ratio >= 0.85 ? 'A' : quote && quote.ratio >= 0.75 ? 'B' : 'C';

  return {
    symbol: info.symbol,
    name: info.name,
    market: info.market,
    submarket: info.submarket,
    open: info.isOpen && !info.suspended,
    payoutRatio: quote?.ratio ?? null,
    breakEven: quote?.breakEven ?? null,
    score,
    tier,
    compatible,
    reasons,
    notes,
    candles,
    metrics,
    isOtc,
  };
}

export interface CatalogState {
  rows: CatalogRow[];
  at: number | null;
  scanning: boolean;
  error: string | null;
}

const state: CatalogState = { rows: [], at: null, scanning: false, error: null };

export const getCatalog = (): CatalogState => state;

/** Varre o universo da Deriv e separa o que é compatível. Roda em segundo plano. */
export async function scanCatalog(): Promise<void> {
  if (state.scanning) return;
  state.scanning = true;
  state.error = null;
  try {
    const all = await getActiveSymbols(derivPublic);
    const list = all.filter((s) => COMPAT.markets.includes(s.market));
    const q = Math.max(1, Math.round((COMPAT.durationMin * 60) / COMPAT.granularity));

    const rows = await mapLimit(list, 4, async (info) => {
      try {
        const offers = await getCallOffers(derivPublic, info.symbol);
        if (!offersIntraday(offers, COMPAT.durationMin * 60)) return classify(info, offers, null, 0, null);
        const [candles, quote] = await Promise.all([
          getCandles(derivPublic, info.symbol, COMPAT.granularity, 2000),
          getPayoutQuote(derivPublic, info.symbol, COMPAT.durationMin),
        ]);
        const m = candles.length > 200 ? analyzeAsset(candles, q) : null;
        return classify(info, offers, quote, candles.length, m);
      } catch {
        const row = classify(info, [], null, 0, null);
        row.reasons = ['Falha ao consultar a Deriv'];
        return row;
      }
    });
    rows.sort((a, b) => Number(b.compatible) - Number(a.compatible) || b.score - a.score);
    state.rows = rows;
    state.at = Math.floor(Date.now() / 1000);
  } catch (e) {
    state.error = (e as Error).message;
  } finally {
    state.scanning = false;
  }
}

export function startCatalog() {
  void scanCatalog();
  setInterval(() => void scanCatalog(), 30 * 60_000);
}
