import type { Candle, PayoutQuote, SymbolInfo } from '../deriv/market.js';

/** O que torna um ativo binário "saudável" para um sistema estatístico. */
export const IDEAL_PROFILE = [
  {
    criterio: 'Payout alto',
    ideal: '≥ 85% de retorno (empate ≤ 54%)',
    porque: 'Cada ponto de payout a menos exige ~0,5 p.p. a mais de acerto para empatar.',
  },
  {
    criterio: 'Preço de mercado real',
    ideal: 'Forex major / commodities / índices com feed externo',
    porque:
      'Preço formado fora da corretora. Evite ativos "OTC" ou feeds proprietários: o emissor controla o preço.',
  },
  {
    criterio: 'Estrutura estatística',
    ideal: 'Razão de variância ≠ 1 de forma estável entre períodos',
    porque:
      'Sem tendência (VR>1) nem reversão (VR<1) não há o que aprender. Passeio aleatório puro = sem edge possível.',
  },
  {
    criterio: 'Expiração ≥ 15 min',
    ideal: 'Velas de 5 min, 3 velas à frente',
    porque: 'Dilui ruído de tick, latência de execução e spread implícito; reduz empates (que perdem).',
  },
  {
    criterio: 'Taxa de empate ≈ 0',
    ideal: 'Preço com casas suficientes (pip pequeno vs. ATR)',
    porque: 'Empate conta como derrota no Rise/Fall. Ativo de pouca resolução desperdiça edge.',
  },
  {
    criterio: 'Janela de liquidez',
    ideal: 'Forex: sobreposição Londres/NY (≈12–16 UTC)',
    porque: 'Mais volume = menos ruído de microestrutura e movimentos mais direcionais.',
  },
  {
    criterio: 'Evitar',
    ideal: 'Índices sintéticos (Volatility, Boom/Crash…) para estratégias de sinal',
    porque:
      'São gerados por RNG auditado: payout lindo (95%), mas matematicamente imprevisíveis. Só servem como grupo de controle.',
  },
];

export interface AssetMetrics {
  candles: number;
  atrPct: number; // volatilidade média por vela, em %
  ac1: number; // autocorrelação lag-1 dos retornos
  ac1Z: number;
  vr: number; // razão de variância em q velas
  vrZ: number;
  tieRate: number; // fração de janelas q com variação exatamente zero
}

/** Razão de variância de Lo-MacKinlay (homocedástica) + autocorrelação lag-1. */
export function analyzeAsset(candles: Candle[], q: number): AssetMetrics {
  const c = candles.map((k) => k.close);
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  const n = r.length;
  const mean = r.reduce((s, v) => s + v, 0) / n;
  const v1 = r.reduce((s, v) => s + (v - mean) ** 2, 0) / n;

  let cov1 = 0;
  for (let i = 1; i < n; i++) cov1 += (r[i] - mean) * (r[i - 1] - mean);
  const ac1 = v1 > 0 ? cov1 / n / v1 : 0;

  let vq = 0;
  let cnt = 0;
  let ties = 0;
  for (let i = q; i < c.length; i++) {
    const rq = Math.log(c[i] / c[i - q]) - q * mean;
    vq += rq * rq;
    cnt++;
    if (c[i] === c[i - q]) ties++;
  }
  const vr = v1 > 0 && cnt > 0 ? vq / cnt / (q * v1) : 1;
  const se = Math.sqrt((2 * (2 * q - 1) * (q - 1)) / (3 * q * n));

  const atrPct =
    (candles.reduce((s, k) => s + (k.high - k.low) / k.close, 0) / candles.length) * 100;

  return {
    candles: candles.length,
    atrPct,
    ac1,
    ac1Z: ac1 * Math.sqrt(n),
    vr,
    vrZ: se > 0 ? (vr - 1) / se : 0,
    tieRate: cnt ? ties / cnt : 0,
  };
}

export interface AssetRow {
  symbol: string;
  name: string;
  market: string;
  submarket: string;
  open: boolean;
  payoutRatio: number | null;
  breakEven: number | null;
  metrics: AssetMetrics | null;
  /** "random_index" = RNG auditado, sem edge possível */
  isRng: boolean;
  score: number; // 0–100, triagem (NÃO é prova de edge)
  notes: string[];
}

/**
 * Pontuação de TRIAGEM. Responde "vale a pena gastar pesquisa neste ativo?",
 * não "este ativo dá lucro". Quem decide lucro é o gate estatístico do walk-forward.
 */
export function scoreAsset(
  info: SymbolInfo,
  quote: PayoutQuote | null,
  m: AssetMetrics | null,
): AssetRow {
  const notes: string[] = [];
  const isRng = info.submarket === 'random_index';
  let score = 0;

  if (!quote) notes.push('Duração não ofertada para este ativo');
  else {
    // 40 pts: payout. 95% -> 40; 80% -> ~16; 70% -> 0
    score += Math.max(0, Math.min(40, ((quote.ratio - 0.7) / 0.25) * 40));
    if (quote.ratio < 0.85) notes.push(`Payout baixo (${(quote.ratio * 100).toFixed(1)}%)`);
  }

  if (m) {
    // 35 pts: estrutura (|VR-1| significativo) — zerado para RNG
    if (isRng) {
      notes.push('RNG auditado: sem estrutura aprendível (usar como placebo)');
    } else {
      const s = Math.min(1, Math.abs(m.vrZ) / 3);
      score += s * 35;
      if (Math.abs(m.vrZ) >= 2)
        notes.push(m.vr > 1 ? 'Indício de tendência (VR>1)' : 'Indício de reversão (VR<1)');
      else notes.push('Sem estrutura estatística relevante na amostra');
    }
    // 15 pts: empates
    score += 15 * Math.max(0, 1 - m.tieRate * 20);
    if (m.tieRate > 0.02) notes.push(`Empates frequentes (${(m.tieRate * 100).toFixed(1)}%)`);
  }

  // 10 pts: mercado aberto
  if (info.isOpen && !info.suspended) score += 10;
  else notes.push('Mercado fechado/suspenso agora');

  if (isRng) score = Math.min(score, 35); // teto: nunca recomendável para sinal

  return {
    symbol: info.symbol,
    name: info.name,
    market: info.market,
    submarket: info.submarket,
    open: info.isOpen && !info.suspended,
    payoutRatio: quote?.ratio ?? null,
    breakEven: quote?.breakEven ?? null,
    metrics: m,
    isRng,
    score: Math.round(score),
    notes,
  };
}
