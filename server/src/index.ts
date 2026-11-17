import express from 'express';
import { config } from './config.js';
import { IDEAL_PROFILE, analyzeAsset, scoreAsset, type AssetRow } from './assets/profile.js';
import {
  breakEvenWinRate,
  expectedLongestStreak,
  expectedValue,
  kellyFraction,
  sampleSizeToDetect,
} from './backtest/stats.js';
import { derivPublic } from './deriv/client.js';
import { getActiveSymbols, getCandles, getPayoutQuote, mapLimit } from './deriv/market.js';
import { defaultParams, readLog, resetLog, runResearch } from './services/research.js';
import { AEGIS_ALPHA_DEFAULTS } from './ai/aegis.js';

const app = express();
app.use(express.json());

const num = (v: unknown, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'PUBLIC_READ_ONLY', note: 'Nenhuma ordem é enviada por este servidor.' });
});

app.get('/api/config', (_req, res) => {
  res.json({ aegisAlphaDefaults: AEGIS_ALPHA_DEFAULTS, idealProfile: IDEAL_PROFILE });
});

app.get('/api/symbols', async (_req, res) => {
  res.json(await getActiveSymbols(derivPublic));
});

/** Calculadora de matemática: dado o payout, mostra o que a IA precisa entregar. */
app.get('/api/math', (req, res) => {
  const ratio = num(req.query.ratio, 0.85, 0.1, 2);
  const p = num(req.query.winRate, 0.56, 0.3, 0.9);
  const be = breakEvenWinRate(ratio);
  res.json({
    ratio,
    breakEven: be,
    houseEdge: be - 0.5,
    winRate: p,
    evPerUnit: expectedValue(p, ratio),
    kelly: kellyFraction(p, ratio),
    tradesToConfirm: sampleSizeToDetect(be, p),
    longestLossStreak500: expectedLongestStreak(500, 1 - p),
  });
});

let profileCache: { key: string; at: number; rows: AssetRow[] } | null = null;

/** Ranking de ativos (triagem). Cache de 10 min para respeitar a API. */
app.get('/api/assets/profile', async (req, res) => {
  const granularity = num(req.query.granularity, 300, 60, 3600);
  const durationMin = num(req.query.durationMin, 15, 1, 240);
  const includeSynthetic = req.query.synthetic === '1';
  const key = `${granularity}|${durationMin}|${includeSynthetic}`;
  if (profileCache && profileCache.key === key && Date.now() - profileCache.at < 600_000) {
    return res.json({ cached: true, rows: profileCache.rows, idealProfile: IDEAL_PROFILE });
  }

  const all = await getActiveSymbols(derivPublic);
  const markets = new Set(['forex', 'commodities', 'indices', 'cryptocurrency']);
  const list = all.filter((s) =>
    includeSynthetic ? markets.has(s.market) || s.submarket === 'random_index' : markets.has(s.market),
  );
  const q = Math.max(1, Math.round((durationMin * 60) / granularity));

  const rows = await mapLimit(list, 4, async (info) => {
    try {
      const [candles, quote] = await Promise.all([
        getCandles(derivPublic, info.symbol, granularity, 2000),
        getPayoutQuote(derivPublic, info.symbol, durationMin),
      ]);
      const m = candles.length > 200 ? analyzeAsset(candles, q) : null;
      return scoreAsset(info, quote, m);
    } catch {
      return scoreAsset(info, null, null);
    }
  });
  rows.sort((a, b) => b.score - a.score);
  profileCache = { key, at: Date.now(), rows };
  res.json({ cached: false, rows, idealProfile: IDEAL_PROFILE });
});

app.post('/api/research', async (req, res) => {
  const b = req.body ?? {};
  const symbol = String(b.symbol ?? 'frxEURUSD');
  if (!/^\w{2,30}$/.test(symbol)) return res.status(400).json({ error: 'símbolo inválido' });
  const d = defaultParams(symbol);
  const result = await runResearch({
    symbol,
    granularity: num(b.granularity, d.granularity, 60, 3600),
    durationMin: num(b.durationMin, d.durationMin, 1, 240),
    count: num(b.count, d.count, 3000, 20000),
    threshold: num(b.threshold, d.threshold, 0, 0.2),
    trainSize: num(b.trainSize, d.trainSize, 500, 5000),
    testSize: num(b.testSize, d.testSize, 50, 2000),
  });
  res.json(result);
});

app.get('/api/research/log', (_req, res) => res.json(readLog()));
app.delete('/api/research/log', (_req, res) => {
  resetLog();
  res.json({ ok: true });
});

// handler de erros (Express 5 encaminha rejeições async para cá)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(502).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`AegisAI API em http://localhost:${config.port}  (modo leitura pública, sem ordens)`);
});
