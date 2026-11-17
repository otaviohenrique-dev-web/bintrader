import { pValueAbove, wilson } from '../backtest/stats.js';

/** Hora local do computador (o servidor roda na sua máquina, então é o seu fuso). */
const localHour = (epochSec: number) => new Date(epochSec * 1000).getHours();
const localDay = (epochSec: number) => {
  const d = new Date(epochSec * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export interface HourStat {
  hour: number;
  n: number;
  wins: number;
  winRate: number | null;
  ci95: [number, number];
  /** resultado em stakes */
  pnl: number;
  /** esperança por operação, em stakes */
  ev: number;
  /** dias distintos em que a IA operou nesta hora */
  days: number;
  /** sinais por hora, média nos dias em que operou */
  perHour: number;
}

/** Desempenho da IA por hora do dia (0–23, horário local). `at` = momento do sinal (epoch s). */
export function hourStats(trades: { at: number; win: boolean; pnl: number }[]): HourStat[] {
  const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, n: 0, wins: 0, pnl: 0, days: new Set<string>() }));
  for (const t of trades) {
    const r = rows[localHour(t.at)];
    r.n++;
    if (t.win) r.wins++;
    r.pnl += t.pnl;
    r.days.add(localDay(t.at));
  }
  return rows.map((r) => ({
    hour: r.hour,
    n: r.n,
    wins: r.wins,
    winRate: r.n ? r.wins / r.n : null,
    ci95: wilson(r.wins, r.n),
    pnl: r.pnl,
    ev: r.n ? r.pnl / r.n : 0,
    days: r.days.size,
    perHour: r.days.size ? r.n / r.days.size : 0,
  }));
}

export interface HourWindow {
  start: number;
  width: number;
  label: string;
  n: number;
  wins: number;
  winRate: number;
  ci95: [number, number];
  ev: number;
  /** quantos sinais a IA costuma dar nesta janela */
  opsPerWindow: number;
  pValue: number;
  /** sobrevive à correção para as 24 janelas testadas? */
  significant: boolean;
}

const pad = (h: number) => String(h % 24).padStart(2, '0');

/**
 * Janelas de `width` horas com melhor acerto (limite inferior do IC95% contra o empate).
 * São 24 janelas testadas, então `significant` usa Bonferroni (α = 0,05 / 24). Quase nunca passa:
 * é o jeito honesto de dizer "isto pode ser acaso".
 */
export function bestWindows(
  hours: HourStat[],
  breakEven: number,
  opts: { width?: number; minN?: number; top?: number } = {},
): HourWindow[] {
  const { width = 3, minN = 150, top = 3 } = opts;
  const all: HourWindow[] = [];
  for (let s = 0; s < 24; s++) {
    let n = 0;
    let wins = 0;
    let pnl = 0;
    let ops = 0;
    for (let k = 0; k < width; k++) {
      const h = hours[(s + k) % 24];
      n += h.n;
      wins += h.wins;
      pnl += h.pnl;
      ops += h.perHour;
    }
    if (n < minN) continue;
    const ci95 = wilson(wins, n);
    const p = pValueAbove(wins, n, breakEven);
    all.push({
      start: s,
      width,
      label: `${pad(s)}h–${pad(s + width)}h`,
      n,
      wins,
      winRate: wins / n,
      ci95,
      ev: pnl / n,
      opsPerWindow: ops,
      pValue: p,
      significant: p < 0.05 / 24,
    });
  }
  all.sort((a, b) => b.ci95[0] - breakEven - (a.ci95[0] - breakEven));
  const taken = new Set<number>();
  const out: HourWindow[] = [];
  for (const w of all) {
    const hs = Array.from({ length: width }, (_, k) => (w.start + k) % 24);
    if (hs.some((h) => taken.has(h))) continue;
    hs.forEach((h) => taken.add(h));
    out.push(w);
    if (out.length >= top) break;
  }
  return out;
}

export type HourRating = 'forte' | 'neutro' | 'fraco' | 'sem dados';

/** Como está a hora atual em relação à média da própria IA (diferença de ±2 p.p. com n ≥ 100). */
export function rateHour(hours: HourStat[], hour: number, overall: number, minN = 100) {
  const h = hours[hour];
  if (!h || h.n < minN || h.winRate === null) return { rating: 'sem dados' as HourRating, winRate: h?.winRate ?? null, n: h?.n ?? 0, diffPp: 0 };
  const diffPp = (h.winRate - overall) * 100;
  const rating: HourRating = diffPp >= 2 ? 'forte' : diffPp <= -2 ? 'fraco' : 'neutro';
  return { rating, winRate: h.winRate, n: h.n, diffPp };
}
