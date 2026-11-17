import { walkForwardAsync } from '../ai/aegis.js';
import { FEATURE_NAMES, buildDataset, latestFeatures } from '../ai/features.js';
import { LogisticModel } from '../ai/model.js';
import { derivPublic } from '../deriv/client.js';
import { getCandles, getPayoutQuote, getRecentCandles, type Candle } from '../deriv/market.js';
import { bandStats, paceStats, perfStats } from './metrics.js';
import { wallet } from './wallet.js';
import { makeSignal, resolveSignal } from './settle.js';
import { readJson, writeJson } from './store.js';
import type { EngineEvent, EventKind, PersistState, Signal, WatchItem } from './types.js';

// ---- parâmetros do aprendizado ---------------------------------------------
const TRAIN_SIZE = 2000; // janela de treino (velas) — a MESMA usada na validação walk-forward
const TEST_SIZE = 250;
const MAX_HISTORY = 30_000; // quanto histórico baixar "para trás"
const INITIAL = 4000; // primeira carga
const BACKFILL_CHUNK = 2000;
const BACKFILL_EVERY_MS = 15_000;
const RETRAIN_EVERY = 12; // velas novas entre retreinos (1 h em M5)
const BACKTEST_EVERY = 48; // velas novas entre revalidações (4 h em M5)
const TICK_MS = 5000;
const GRACE_S = 2; // vela só conta como fechada 2 s depois do fim (latência do feed)
const FRESH_S = 90; // não emite sinal sobre dado mais velho que isso
const ADAPT_WINDOW = 40; // sinais liquidados usados para ajustar a seletividade
const ADAPT_STEP_EVERY = 20;
const THRESHOLD_MAX = 0.12;

/** Limites e parâmetros do Aegis IA, expostos na tela "Aegis IA". */
export const LIMITS = {
  trainWindow: TRAIN_SIZE,
  validationWindow: TEST_SIZE,
  maxHistory: MAX_HISTORY,
  initialLoad: INITIAL,
  backfillChunk: BACKFILL_CHUNK,
  backfillEverySec: BACKFILL_EVERY_MS / 1000,
  retrainEveryCandles: RETRAIN_EVERY,
  revalidateEveryCandles: BACKTEST_EVERY,
  tickSec: TICK_MS / 1000,
  freshSec: FRESH_S,
  adaptWindow: ADAPT_WINDOW,
  adaptStepEvery: ADAPT_STEP_EVERY,
  thresholdBase: 0.03,
  thresholdMax: THRESHOLD_MAX,
  thresholdStep: 0.01,
  maxSignalsStored: 5000,
  maxEventsStored: 80,
  maxWatch: 6,
  openPerAsset: 1,
};

interface Backtest {
  trades: { time: number; side: 'CALL' | 'PUT'; prob: number; win: boolean; pnl: number }[];
  at: number;
  candles: number;
  from: number;
  to: number;
  folds: number;
  payoutRatio: number;
}

export class SymbolEngine {
  readonly cfg: WatchItem;
  private horizon: number;

  private closed: Candle[] = [];
  private forming: Candle | null = null;
  private model: LogisticModel | null = null;
  private st: PersistState;

  private timer?: NodeJS.Timeout;
  private busy = false;
  private ready = false;
  private exhausted = false;
  private lastBackfillAt = 0;
  private btRunning = false;
  private candlesSinceTrain = 0;
  private candlesSinceBacktest = 0;
  private lastTrainAt: number | null = null;
  private samples = 0;
  private weights: { feature: string; weight: number }[] = [];
  private payoutRatio: number | null = null;
  private lastPred: {
    time: number;
    prob: number;
    side: 'CALL' | 'PUT' | null;
    threshold: number;
    reason?: string;
  } | null = null;
  private bt: Backtest | null = null;
  private error: string | null = null;

  constructor(
    cfg: WatchItem,
    private emit: (e: EngineEvent) => void,
  ) {
    this.cfg = cfg;
    this.horizon = Math.max(1, Math.round((cfg.durationMin * 60) / cfg.granularity));
    this.st = readJson<PersistState>(this.stateFile, {
      signals: [],
      events: [],
      threshold: cfg.baseThreshold,
      retrains: 0,
      adaptAnchor: 0,
      createdAt: Math.floor(Date.now() / 1000),
    });
  }

  private get stateFile() {
    return `engine-${this.cfg.symbol}-${this.cfg.granularity}-${this.cfg.durationMin}.json`;
  }
  private get candleFile() {
    return `candles-${this.cfg.symbol}-${this.cfg.granularity}.json`;
  }
  private get g() {
    return this.cfg.granularity;
  }

  // ---- ciclo de vida -------------------------------------------------------
  start() {
    this.log('start', 'Motor iniciado');
    const run = () => void this.tick();
    run();
    this.timer = setInterval(run, TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.persistState();
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!this.ready) await this.bootstrap();
      else await this.step();
      if (this.error) {
        this.error = null;
        this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'status' });
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== this.error) {
        this.error = msg;
        this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'status' });
      }
    } finally {
      this.busy = false;
    }
  }

  // ---- bootstrap: "nasce treinada" ------------------------------------------
  private async bootstrap() {
    const cached = readJson<number[][]>(this.candleFile, []);
    this.closed = cached.map((a) => ({ time: a[0], open: a[1], high: a[2], low: a[3], close: a[4] }));
    const now = Math.floor(Date.now() / 1000);

    if (this.closed.length < 1500) {
      this.mergeSorted(await getCandles(derivPublic, this.cfg.symbol, this.g, INITIAL));
    } else {
      const gap = Math.ceil((now - this.closed[this.closed.length - 1].time) / this.g);
      if (gap > 0) {
        this.mergeSorted(
          await getCandles(derivPublic, this.cfg.symbol, this.g, Math.min(gap + 5, 8000)),
        );
      }
    }
    if (this.closed.length < 500) throw new Error('Histórico insuficiente para treinar');

    const q = await getPayoutQuote(derivPublic, this.cfg.symbol, this.cfg.durationMin);
    if (q) this.payoutRatio = q.ratio;

    this.retrain('Pré-treino com o histórico baixado');
    this.persistCandles();
    await this.predictLatest(now); // leitura imediata; só vira sinal se o dado estiver fresco
    this.ready = true;
    this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'learning' });
    void this.runBacktest('Validação inicial');
  }

  // ---- loop principal ------------------------------------------------------
  private async step() {
    const now = Math.floor(Date.now() / 1000);
    const recent = await getRecentCandles(derivPublic, this.cfg.symbol, this.g);
    const isClosed = (k: Candle) => k.time + this.g + GRACE_S <= now;

    let appended = 0;
    for (const k of recent.filter(isClosed)) if (this.upsert(k)) appended++;
    this.forming = recent.filter((k) => !isClosed(k)).at(-1) ?? null;
    if (this.forming) {
      this.emit({ type: 'tick', symbol: this.cfg.symbol, candle: this.forming });
    }

    if (appended > 0) {
      this.candlesSinceTrain += appended;
      this.candlesSinceBacktest += appended;
      this.settle(now);
      if (this.candlesSinceTrain >= RETRAIN_EVERY) this.retrain('Retreino com as velas mais recentes');
      if (this.candlesSinceBacktest >= BACKTEST_EVERY) void this.runBacktest('Revalidação periódica');
      await this.predictLatest(now);
      this.persistCandles();
      this.persistState();
      this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'candle' });
    } else {
      this.settle(now); // detecta sinais anulados (sem vela de saída)
    }

    await this.maybeBackfill();
  }

  // ---- previsão ------------------------------------------------------------
  private async predictLatest(now: number) {
    if (!this.model) return;
    const last = this.closed[this.closed.length - 1];
    const f = latestFeatures(this.closed.slice(-600));
    if (!f) return;

    const prob = this.model.predict(f);
    const dev = prob - 0.5;
    const thr = this.st.threshold;
    const side: 'CALL' | 'PUT' | null = dev >= thr ? 'CALL' : dev <= -thr ? 'PUT' : null;
    this.lastPred = { time: last.time, prob, side, threshold: thr };
    if (!side) return;

    if (now - (last.time + this.g) > FRESH_S) {
      this.lastPred.reason = 'Dados defasados';
      return;
    }
    if (this.st.signals.some((s) => s.status === 'open')) {
      this.lastPred.reason = 'Sinal anterior ainda aberto';
      return;
    }
    const id = `${this.cfg.symbol}-${last.time}`;
    if (this.st.signals.some((s) => s.id === id)) return;

    const q = await getPayoutQuote(derivPublic, this.cfg.symbol, this.cfg.durationMin);
    if (q) this.payoutRatio = q.ratio;
    if (!this.payoutRatio) {
      this.lastPred.reason = 'Sem cotação de payout';
      return;
    }

    const sig = makeSignal({
      symbol: this.cfg.symbol,
      side,
      prob,
      entry: last,
      granularity: this.g,
      horizon: this.horizon,
      payoutRatio: this.payoutRatio,
      threshold: thr,
    });
    sig.stake = wallet.nextStake();
    this.st.signals.push(sig);
    if (this.st.signals.length > LIMITS.maxSignalsStored) this.st.signals.shift();
    this.log(
      'signal',
      `${side === 'CALL' ? 'Alta' : 'Baixa'} · confiança ${(Math.abs(dev) * 100).toFixed(1)} pp · entrada ${last.close}`,
    );
    this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'signal' });
  }

  // ---- liquidação e aprendizado com o resultado -----------------------------
  private settle(now: number) {
    let changed = false;
    this.st.signals = this.st.signals.map((s) => {
      if (s.status !== 'open') return s;
      const r = resolveSignal(s, this.candleAt(s.expiresAt - this.g), now, this.g);
      if (r !== s) {
        changed = true;
        if (r.status === 'win' || r.status === 'loss') wallet.settle({ ...r, status: r.status }, this.cfg.name);
        const label = r.status === 'win' ? 'WIN' : r.status === 'loss' ? 'LOSS' : 'Anulado';
        this.log('settled', `${label} · ${r.side === 'CALL' ? 'Alta' : 'Baixa'} ${r.entryPrice} → ${r.exitPrice ?? '—'}`);
      }
      return r;
    });
    if (changed) {
      this.adaptThreshold();
      this.persistState();
      this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'settled' });
    }
  }

  /**
   * Feedback dos resultados reais: se os últimos sinais estão abaixo do empate, a IA fica
   * mais seletiva; se estão bem acima, relaxa de volta ao limiar base. Passo curto e limitado.
   */
  private adaptThreshold() {
    const done = this.st.signals.filter((s) => s.status === 'win' || s.status === 'loss');
    if (done.length < ADAPT_WINDOW || done.length - this.st.adaptAnchor < ADAPT_STEP_EVERY) return;
    const recent = done.slice(-ADAPT_WINDOW);
    const wr = recent.filter((s) => s.status === 'win').length / recent.length;
    const ratio = recent.reduce((a, s) => a + s.payoutRatio, 0) / recent.length;
    const be = 1 / (1 + ratio);
    const before = this.st.threshold;
    if (wr < be - 0.03 && before < THRESHOLD_MAX) this.st.threshold = Math.min(THRESHOLD_MAX, before + 0.01);
    else if (wr > be + 0.03 && before > this.cfg.baseThreshold)
      this.st.threshold = Math.max(this.cfg.baseThreshold, before - 0.01);
    this.st.adaptAnchor = done.length;
    if (this.st.threshold !== before) {
      this.log(
        'threshold',
        `Seletividade ${(before * 100).toFixed(0)} → ${(this.st.threshold * 100).toFixed(0)} pp (últimos ${ADAPT_WINDOW}: ${(wr * 100).toFixed(0)}% vs empate ${(be * 100).toFixed(0)}%)`,
      );
    }
  }

  // ---- aprendizado: para frente (retreino) e para trás (histórico) ----------
  private retrain(reason: string) {
    const window = this.closed.slice(-TRAIN_SIZE);
    const ds = buildDataset(window, this.horizon);
    if (ds.X.length < 300) return;
    const model = new LogisticModel().fit(ds.X, ds.y);
    this.model = model;
    this.samples = ds.X.length;
    this.weights = FEATURE_NAMES.map((f, j) => ({ feature: f, weight: model.w[j] }));
    this.candlesSinceTrain = 0;
    this.lastTrainAt = Math.floor(Date.now() / 1000);
    this.st.retrains++;
    this.log('retrain', `${reason} · ${ds.X.length} amostras`);
    this.persistState();
  }

  private async maybeBackfill() {
    if (this.exhausted || this.closed.length >= MAX_HISTORY) return;
    if (Date.now() - this.lastBackfillAt < BACKFILL_EVERY_MS) return;
    this.lastBackfillAt = Date.now();

    const oldest = this.closed[0].time;
    const chunk = await getCandles(derivPublic, this.cfg.symbol, this.g, BACKFILL_CHUNK, oldest - 1);
    const before = this.closed.length;
    this.mergeSorted(chunk.filter((k) => k.time < oldest));
    const added = this.closed.length - before;

    if (added <= 0) {
      this.exhausted = true;
      this.log('backfill', `Histórico completo: ${this.closed.length.toLocaleString('pt-BR')} velas`);
    } else {
      this.log('backfill', `+${added.toLocaleString('pt-BR')} velas antigas · total ${this.closed.length.toLocaleString('pt-BR')}`);
    }
    this.persistCandles();
    this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'learning' });
    if (this.exhausted || this.closed.length >= MAX_HISTORY) {
      void this.runBacktest('Validação sobre o histórico completo');
    }
  }

  private async runBacktest(reason: string) {
    if (this.btRunning) return;
    this.btRunning = true;
    this.candlesSinceBacktest = 0;
    try {
      const candles = this.closed.slice(-MAX_HISTORY);
      const ratio = this.payoutRatio ?? 0.85;
      const res = await walkForwardAsync(candles, {
        horizon: this.horizon,
        trainSize: TRAIN_SIZE,
        testSize: TEST_SIZE,
        threshold: this.cfg.baseThreshold,
        payoutRatio: ratio,
      });
      this.bt = {
        trades: res.trades,
        at: Math.floor(Date.now() / 1000),
        candles: candles.length,
        from: candles[0].time,
        to: candles[candles.length - 1].time,
        folds: res.folds,
        payoutRatio: ratio,
      };
      const s = res.summary;
      this.log(
        'backtest',
        `${reason} · ${s.trades.toLocaleString('pt-BR')} operações fora da amostra · acerto ${(s.winRate * 100).toFixed(1)}%`,
      );
      this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'learning' });
    } finally {
      this.btRunning = false;
    }
  }

  // ---- utilidades -----------------------------------------------------------
  private upsert(k: Candle): boolean {
    const n = this.closed.length;
    if (n === 0 || k.time > this.closed[n - 1].time) {
      this.closed.push(k);
      return true;
    }
    for (let i = n - 1; i >= Math.max(0, n - 30); i--) {
      if (this.closed[i].time === k.time) {
        this.closed[i] = k;
        return false;
      }
      if (this.closed[i].time < k.time) break;
    }
    return false;
  }

  private mergeSorted(extra: Candle[]) {
    const m = new Map<number, Candle>();
    for (const k of this.closed) m.set(k.time, k);
    for (const k of extra) m.set(k.time, k);
    this.closed = [...m.values()].sort((a, b) => a.time - b.time);
  }

  private candleAt(time: number): Candle | undefined {
    let lo = 0;
    let hi = this.closed.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const t = this.closed[mid].time;
      if (t === time) return this.closed[mid];
      if (t < time) lo = mid + 1;
      else hi = mid - 1;
    }
    return undefined;
  }

  private log(kind: EventKind, text: string) {
    this.st.events.push({ at: Math.floor(Date.now() / 1000), kind, text });
    if (this.st.events.length > 80) this.st.events.shift();
  }

  private persistState() {
    writeJson(this.stateFile, this.st);
  }

  private persistCandles() {
    writeJson(
      this.candleFile,
      this.closed.map((k) => [k.time, k.open, k.high, k.low, k.close]),
    );
  }

  // ---- visão para a API -----------------------------------------------------
  snapshot() {
    const now = Math.floor(Date.now() / 1000);
    const ratio = this.payoutRatio ?? 0.85;
    const settled = this.st.signals.filter((s) => s.status === 'win' || s.status === 'loss');
    const live = perfStats(
      settled.map((s) => ({ win: s.status === 'win', pnl: s.pnl ?? 0 })),
      settled.length
        ? settled.reduce((a, s) => a + s.payoutRatio, 0) / settled.length
        : ratio,
    );

    const bt = this.bt;
    const retro = bt ? perfStats(bt.trades, bt.payoutRatio) : null;

    const base = this.cfg.baseThreshold;
    const edges = [base, base + 0.02, base + 0.05, 1];
    const bands = bandStats(
      bt ? bt.trades.map((t) => ({ confidence: Math.abs(t.prob - 0.5), win: t.win })) : [],
      settled.map((s) => ({ confidence: s.confidence, win: s.status === 'win' })),
      edges,
    );

    const last = this.closed[this.closed.length - 1];
    const candles = this.closed.slice(-600).map((k) => ({ ...k, forming: false }));
    if (this.forming) candles.push({ ...this.forming, forming: true });

    let equity: number[] = [];
    if (bt) {
      let e = 0;
      const full = [0, ...bt.trades.map((t) => (e += t.pnl))];
      const step = Math.max(1, Math.ceil(full.length / 240));
      equity = full.filter((_, i) => i % step === 0 || i === full.length - 1);
    }

    return {
      now,
      config: { ...this.cfg, horizon: this.horizon },
      wallet: wallet.summary(),
      pace: {
        live: paceStats(settled, this.g),
        retro: bt
          ? paceStats(
              bt.trades.map((t) => ({ issuedAt: t.time + this.g, expiresAt: t.time + this.g + this.horizon * this.g, side: t.side })),
              this.g,
            )
          : null,
      },
      ready: this.ready,
      error: this.error,
      stale: last ? now - (last.time + this.g) > this.g * 2.5 : true,
      candles,
      signals: this.st.signals.slice(-1000),
      payoutRatio: this.payoutRatio,
      breakEven: 1 / (1 + ratio),
      lastPrediction: this.lastPred,
      nextCloseAt: this.forming ? this.forming.time + this.g : null,
      stats: { live, retro },
      backtest: bt
        ? {
            at: bt.at,
            candles: bt.candles,
            from: bt.from,
            to: bt.to,
            folds: bt.folds,
            payoutRatio: bt.payoutRatio,
            equity,
            trades: bt.trades.slice(-500).map((t) => ({ time: t.time, side: t.side, win: t.win, prob: t.prob })),
          }
        : null,
      running: this.btRunning,
      learning: {
        historyCandles: this.closed.length,
        historyTarget: MAX_HISTORY,
        historyFrom: this.closed[0]?.time ?? null,
        historyTo: last?.time ?? null,
        exhausted: this.exhausted,
        trainWindow: TRAIN_SIZE,
        samples: this.samples,
        retrains: this.st.retrains,
        lastTrainAt: this.lastTrainAt,
        threshold: this.st.threshold,
        baseThreshold: this.cfg.baseThreshold,
        weights: this.weights,
        bands,
      },
      events: this.st.events.slice(-40),
    };
  }

  /** Sinais liquidados desta sessão e anteriores (para testes/diagnóstico). */
  get signals(): Signal[] {
    return this.st.signals;
  }
}
