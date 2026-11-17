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
import fs from 'node:fs';
import path from 'node:path';
import { engine, MAX_WATCH } from './engine/manager.js';
import { acquireLock } from './engine/lock.js';
import { LIMITS } from './engine/symbolEngine.js';
import { dataDir } from './engine/store.js';
import { wallet, WALLET_LIMITS } from './engine/wallet.js';
import { bestWindows, hourStats, rateHour } from './engine/hours.js';
import { buildPlan, PROFILES, type RiskProfile } from './engine/plan.js';
import { loadPlanSettings, savePlanSettings } from './engine/planStore.js';
import { toolboxCatalog, VERSION_K } from './engine/toolkit.js';
import { fileURLToPath } from 'node:url';
import { AEGIS_MODEL } from './ai/aegis.js';
import { FEATURE_NAMES } from './ai/features.js';
import { COMPAT, getCatalog, scanCatalog, startCatalog } from './assets/catalog.js';

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

// ---- catálogo de ativos compatíveis ------------------------------------------

app.get('/api/assets/catalog', (_req, res) => {
  res.json({ ...getCatalog(), compat: COMPAT });
});

app.post('/api/assets/catalog/refresh', (_req, res) => {
  void scanCatalog();
  res.json({ ok: true });
});

// ---- carteira fictícia (R$) ----------------------------------------------------

app.get('/api/wallet', (_req, res) => {
  res.json({ summary: wallet.summary(), ledger: wallet.ledger(300), equity: wallet.equity(), limits: WALLET_LIMITS });
});

app.post('/api/wallet/settings', (req, res) => {
  const b = req.body ?? {};
  wallet.updateSettings({ stakeMode: b.stakeMode, stakePercent: Number(b.stakePercent), stakeFixed: Number(b.stakeFixed) });
  res.json({ summary: wallet.summary() });
});

app.post('/api/wallet/reset', (req, res) => {
  const initial = Number(req.body?.initial);
  if (!Number.isFinite(initial)) return res.status(400).json({ error: 'saldo inicial inválido' });
  wallet.reset(initial);
  res.json({ summary: wallet.summary() });
});

// ---- perfil do agente (tela "Aegis IA") ----------------------------------------

const PURPOSE: [RegExp, string][] = [
  [/^candles-/, 'Histórico de velas (cache local do que foi baixado da Deriv)'],
  [/^engine-/, 'Sinais, resultados, eventos de aprendizado e seletividade'],
  [/^wallet/, 'Carteira fictícia em R$ (saldo e extrato)'],
  [/^watchlist/, 'Ativos que você está monitorando'],
  [/^research-log/, 'Registro dos estudos do laboratório (correção de múltiplos testes)'],
  [/^research-/, 'Bancada: hipóteses testadas, cofre, decisões e linha de versões'],
  [/^backtest-/, 'Validação retroativa guardada (aparece na hora ao ligar)'],
  [/^thoughts/, 'Linha de raciocínio recente da IA'],
  [/^plan/, 'Seu plano de entrada: saldo informado, perfil e stops'],
];

app.get('/api/ai', (_req, res) => {
  const files = fs.existsSync(dataDir)
    ? fs
        .readdirSync(dataDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const st = fs.statSync(path.join(dataDir, f));
          return {
            file: f,
            bytes: st.size,
            updatedAt: Math.floor(st.mtimeMs / 1000),
            purpose: PURPOSE.find(([re]) => re.test(f))?.[1] ?? 'Dados do sistema',
          };
        })
        .sort((a, b) => a.file.localeCompare(b.file))
    : [];
  res.json({ model: AEGIS_MODEL, features: FEATURE_NAMES, limits: LIMITS, compat: COMPAT, maxWatch: MAX_WATCH, storage: files, dataDir: 'server/data' });
});

// ---- motor de sinais -------------------------------------------------------

app.get('/api/watchlist', (_req, res) => res.json(engine.list()));

app.post('/api/watchlist', async (req, res) => {
  const b = req.body ?? {};
  const symbol = String(b.symbol ?? '');
  if (!/^\w{2,30}$/.test(symbol)) return res.status(400).json({ error: 'símbolo inválido' });
  const granularity = num(b.granularity, 300, 60, 900);
  const durationMin = num(b.durationMin, 15, 1, 240);
  const quote = await getPayoutQuote(derivPublic, symbol, durationMin);
  if (!quote) {
    return res.status(400).json({ error: `A Deriv não oferece ${durationMin} min para este ativo agora` });
  }
  try {
    engine.add({
      symbol,
      name: await engine.symbolName(symbol),
      granularity,
      durationMin,
      baseThreshold: AEGIS_ALPHA_DEFAULTS.threshold,
    });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
  res.json(engine.list());
});

app.delete('/api/watchlist/:symbol', (req, res) => {
  try {
    engine.remove(req.params.symbol);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
  res.json(engine.list());
});

app.get('/api/engine/:symbol', (req, res) => {
  const e = engine.get(req.params.symbol);
  if (!e) return res.status(404).json({ error: 'ativo não monitorado' });
  res.json({ ...e.snapshot(), version: engine.research.version(req.params.symbol) });
});

/** Histórico unificado: todas as operações, de todos os pares monitorados. */
app.get('/api/signals', (_req, res) => {
  res.json(engine.allSignals().slice(0, 1000));
});

// ---- bancada de pesquisa (ferramentas, hipóteses, cofre e versões) ----------------

app.get('/api/toolbox', (_req, res) => res.json({ ...toolboxCatalog(), versionK: VERSION_K }));

app.get('/api/bench/:symbol', (req, res) => {
  if (!engine.get(req.params.symbol)) return res.status(404).json({ error: 'ativo não monitorado' });
  res.json(engine.research.summary(req.params.symbol));
});

app.post('/api/bench/:symbol/run', (req, res) => {
  if (!engine.get(req.params.symbol)) return res.status(404).json({ error: 'ativo não monitorado' });
  engine.research.runNow(req.params.symbol);
  res.json({ ok: true });
});

// ---- plano de entrada e melhores horários -----------------------------------------

const planQuery = (q: Record<string, unknown>) => {
  const cur = loadPlanSettings();
  const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));
  return {
    balance: (num(q.balance) ?? 0) >= 1 ? (num(q.balance) as number) : cur.balance,
    profile: (q.profile === 'conservador' || q.profile === 'moderado' || q.profile === 'agressivo' ? q.profile : cur.profile) as RiskProfile,
    stopLossPct: Number.isFinite(num(q.stopLoss)) ? (num(q.stopLoss) as number) : cur.stopLossPct,
    stopGainPct: Number.isFinite(num(q.stopGain)) ? (num(q.stopGain) as number) : cur.stopGainPct,
  };
};

app.post('/api/plan/settings', (req, res) => {
  const b = req.body ?? {};
  res.json(savePlanSettings({ balance: Number(b.balance), profile: b.profile, stopLossPct: b.stopLossPct === null ? null : Number(b.stopLossPct), stopGainPct: b.stopGainPct === null ? null : Number(b.stopGainPct) }));
});

app.get('/api/plan/:symbol', (req, res) => {
  const e = engine.get(req.params.symbol);
  if (!e?.isReady) return res.status(503).json({ error: 'a IA ainda está preparando este ativo' });
  const set = planQuery(req.query);
  const ref = e.referenceStats();
  const ratio = e.currentPayout ?? 0.8;
  const hours = hourStats(e.tradesForHours());
  const tot = hours.reduce((a, h) => ({ n: a.n + h.n, w: a.w + h.wins }), { n: 0, w: 0 });
  const overall = tot.n ? tot.w / tot.n : ref.winRate;
  const windows = bestWindows(hours, ref.breakEven, { width: 3, minN: 150, top: 3 }).map((w) => {
    const ops = Math.max(1, Math.round(w.opsPerWindow));
    const p = buildPlan({ balance: set.balance, profile: set.profile, payoutRatio: ratio, winRate: w.winRate, ci95: w.ci95, n: ref.n >= 100 && w.significant ? w.n : Math.min(w.n, 99), stopLossPct: set.stopLossPct ?? undefined, stopGainPct: set.stopGainPct ?? undefined, opsBudget: ops });
    return { ...w, recommendedOps: Math.min(ops, Math.max(2, p.lossesToStop * 2)), sim: p.sim, stake: p.stake };
  });
  // dia típico: total de sinais dividido pelos dias em que a IA operou (os stops só fazem sentido no dia inteiro)
  const tradingDays = Math.max(1, ...hours.map((h) => h.days));
  const sessionOps = Math.min(150, Math.max(1, Math.round(tot.n / tradingDays)));
  const plan = buildPlan({ balance: set.balance, profile: set.profile, payoutRatio: ratio, winRate: ref.winRate, ci95: ref.ci95, n: ref.n, stopLossPct: set.stopLossPct ?? undefined, stopGainPct: set.stopGainPct ?? undefined, opsBudget: sessionOps });
  res.json({
    symbol: req.params.symbol,
    name: e.cfg.name,
    settings: set,
    profiles: PROFILES,
    reference: { winRate: ref.winRate, ci95: ref.ci95, n: ref.n, source: ref.source, payoutRatio: ratio, breakEven: ref.breakEven },
    plan,
    hours,
    overall,
    windows,
    nowHour: rateHour(hours, new Date().getHours(), overall),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

/** Server-Sent Events: ticks da vela em formação e avisos de novos sinais/resultados. */
app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  engine.on('event', send);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    engine.off('event', send);
  });
});

// interface empacotada: com `npm start` tudo roda em uma porta só
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(webDist, 'index.html')) : next()));
}

// handler de erros (Express 5 encaminha rejeições async para cá)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(502).json({ error: err.message });
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    engine.flush();
    process.exit(0);
  });
}

const lock = await acquireLock();
if (!lock.ok) {
  console.error(
    `Já existe outra instância do OrderFlow Lab usando server/data (PID ${lock.holder}). Feche-a antes de iniciar esta. Se for engano, apague server/data/.lock.`,
  );
  process.exit(1);
}

app.listen(config.port, (err?: Error) => {
  if (err) {
    console.error(`Não consegui abrir a porta ${config.port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`OrderFlow Lab em http://localhost:${config.port}  (somente leitura, sem ordens)`);
  engine.boot().catch((e) => console.error('falha ao iniciar o motor', e));
  setTimeout(startCatalog, 4000); // varredura de compatíveis em segundo plano
});
