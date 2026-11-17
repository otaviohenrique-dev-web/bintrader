import { walkForwardAsync } from '../ai/aegis.js';
import { DEFAULT_GROUPS, buildDataset, featureNames, latestFeatures, type GroupId } from '../ai/features.js';
import { LogisticModel } from '../ai/model.js';
import { derivPublic } from '../deriv/client.js';
import { getCandles, getPayoutQuote, getRecentCandles, type Candle } from '../deriv/market.js';
import { hourStats, rateHour } from './hours.js';
import { bandStats, paceStats, perfStats } from './metrics.js';
import { makeSignal, resolveSignal } from './settle.js';
import { readJson, writeJson } from './store.js';
import { thoughts } from './thoughts.js';
import { maxHistoryFor, testWindowFor, tfLabel, toolkitLabel, trainWindowFor } from './toolkit.js';
import type { EngineEvent, EventKind, PersistState, Signal, WatchItem } from './types.js';
import { wallet } from './wallet.js';

// ---- parâmetros do aprendizado ---------------------------------------------
const INITIAL = 4000; // primeira carga
const BACKFILL_CHUNK = 2000;
const BACKFILL_EVERY_MS = 15_000;
const RETRAIN_EVERY = 12; // velas novas entre retreinos
const BACKTEST_EVERY = 48; // velas novas entre revalidações
const TICK_MS = 5000;
const GRACE_S = 2; // vela só conta como fechada 2 s depois do fim (latência do feed)
const FRESH_S = 90; // não emite sinal sobre dado mais velho que isso
const ADAPT_WINDOW = 40; // sinais liquidados usados para ajustar a seletividade
const ADAPT_STEP_EVERY = 20;
const THRESHOLD_MAX = 0.12;
const PERSIST_EVERY_S = 60;

/** Limites e parâmetros do Aegis IA (valores do tempo gráfico M5), expostos na tela "Aegis IA". */
export const LIMITS = {
  trainWindow: trainWindowFor(300),
  validationWindow: testWindowFor(300),
  maxHistory: maxHistoryFor(300),
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
  researchEveryHours: 6,
  vaultShare: 0.3,
};

interface BtTrade {
  time: number;
  side: 'CALL' | 'PUT';
  prob: number;
  win: boolean;
  pnl: number;
}

interface Backtest {
  trades: BtTrade[];
  at: number;
  candles: number;
  from: number;
  to: number;
  folds: number;
  payoutRatio: number;
}

export interface Explain {
  time: number;
  prob: number;
  bias: number;
  items: { feature: string; value: number; z: number; weight: number; contribution: number }[];
}

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const sgn = (v: number, d = 2) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), d)}`;
const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const span = (s: number) => {
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = m / 60;
  return h < 48 ? `${h.toFixed(h < 10 ? 1 : 0).replace('.', ',')} h` : `${Math.round(h / 24)} dias`;
};

export class SymbolEngine {
  readonly cfg: WatchItem;
  readonly groups: GroupId[];
  private horizon: number;
  private trainSize: number;
  private testSize: number;
  private maxHistory: number;

  private closed: Candle[] = [];
  private forming: Candle | null = null;
  private model: LogisticModel | null = null;
  private st: PersistState;

  private timer?: NodeJS.Timeout;
  private busy = false;
  private ready = false;
  private exhausted = false;
  private lastBackfillAt = 0;
  private lastPersistAt = 0;
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
  private lastExplain: Explain | null = null;
  private resumeInfo: { at: number; offlineSec: number; settled: number } | null = null;
  private bt: Backtest | null = null;
  private error: string | null = null;

  constructor(
    cfg: WatchItem,
    private emit: (e: EngineEvent) => void,
  ) {
    this.cfg = cfg;
    this.groups = cfg.groups ?? DEFAULT_GROUPS;
    this.horizon = Math.max(1, Math.round((cfg.durationMin * 60) / cfg.granularity));
    this.trainSize = trainWindowFor(cfg.granularity);
    this.testSize = testWindowFor(cfg.granularity);
    this.maxHistory = maxHistoryFor(cfg.granularity);
    const saved = readJson<Partial<PersistState>>(this.stateFile, {});
    this.st = {
      signals: saved.signals ?? [],
      events: saved.events ?? [],
      threshold: saved.threshold ?? cfg.baseThreshold,
      retrains: saved.retrains ?? 0,
      adaptAnchor: saved.adaptAnchor ?? 0,
      createdAt: saved.createdAt ?? Math.floor(Date.now() / 1000),
      builds: saved.builds ?? saved.retrains ?? 0,
      lastSeen: saved.lastSeen ?? 0,
      validations: saved.validations ?? [],
    };
    this.bt = this.loadBacktest();
  }

  private get key() {
    return `${this.cfg.symbol}-${this.cfg.granularity}-${this.cfg.durationMin}`;
  }
  private get stateFile() {
    return `engine-${this.key}.json`;
  }
  private get backtestFile() {
    return `backtest-${this.key}.json`;
  }
  private get candleFile() {
    return `candles-${this.cfg.symbol}-${this.cfg.granularity}.json`;
  }
  private get g() {
    return this.cfg.granularity;
  }
  private think(kind: Parameters<typeof thoughts.think>[1], text: string) {
    thoughts.think(this.cfg.symbol, kind, text);
  }

  // ---- ciclo de vida -------------------------------------------------------
  start() {
    this.log('start', `Motor iniciado · ${toolkitLabel({ ...this.cfg, setId: this.cfg.setId ?? 'default', groups: this.groups })}`);
    const run = () => void this.tick();
    run();
    this.timer = setInterval(run, TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.st.lastSeen = Math.floor(Date.now() / 1000);
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

  // ---- bootstrap: retoma de onde parou ---------------------------------------
  private async bootstrap() {
    const cached = readJson<number[][]>(this.candleFile, []);
    this.closed = cached.map((a) => ({ time: a[0], open: a[1], high: a[2], low: a[3], close: a[4] }));
    const now = Math.floor(Date.now() / 1000);
    const offline = this.st.lastSeen ? now - this.st.lastSeen : 0;

    if (this.closed.length < 1500) {
      this.mergeSorted(await getCandles(derivPublic, this.cfg.symbol, this.g, INITIAL));
    } else {
      const gap = Math.ceil((now - this.closed[this.closed.length - 1].time) / this.g);
      if (gap > 0) {
        this.mergeSorted(await getCandles(derivPublic, this.cfg.symbol, this.g, Math.min(gap + 5, 8000)));
      }
    }
    if (this.closed.length < 500) throw new Error('Histórico insuficiente para treinar');

    const q = await getPayoutQuote(derivPublic, this.cfg.symbol, this.cfg.durationMin);
    if (q) this.payoutRatio = q.ratio;

    // sinais que venceram enquanto o computador estava desligado são liquidados agora, com o preço real
    const settledOffline = this.settle(now, true);
    if (offline > 180 || settledOffline > 0) {
      this.resumeInfo = { at: now, offlineSec: offline, settled: settledOffline };
      const msg =
        `Retomei de onde parei: ficamos ${span(offline)} sem conversar. ` +
        `Recuperei ${this.closed.length.toLocaleString('pt-BR')} velas guardadas` +
        (settledOffline ? `, liquidei ${settledOffline} sinal(is) que venceram nesse intervalo` : '') +
        ` e mantive banca, seletividade e histórico.`;
      this.log('resume', `Retomado após ${span(offline)} offline${settledOffline ? ` · ${settledOffline} sinal(is) liquidado(s)` : ''}`);
      this.think('system', msg);
    }

    this.retrain('Retreino ao ligar');
    this.persistCandles();
    await this.predictLatest(now); // leitura imediata; só vira sinal se o dado estiver fresco
    this.ready = true;
    this.persistState();
    this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'learning' });
    if (!this.bt) void this.runBacktest('Validação inicial');
    else void this.runBacktest('Revalidação ao ligar');
  }

  // ---- loop principal ------------------------------------------------------
  private async step() {
    const now = Math.floor(Date.now() / 1000);
    this.st.lastSeen = now;
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
      if (now - this.lastPersistAt >= PERSIST_EVERY_S) this.persistState();
    }

    await this.maybeBackfill();
  }

  // ---- previsão e raciocínio -------------------------------------------------
  private async predictLatest(now: number) {
    if (!this.model) return;
    const last = this.closed[this.closed.length - 1];
    const f = latestFeatures(this.closed.slice(-600), this.groups);
    if (!f) return;

    const prob = this.model.predict(f);
    const dev = prob - 0.5;
    const thr = this.st.threshold;
    const side: 'CALL' | 'PUT' | null = dev >= thr ? 'CALL' : dev <= -thr ? 'PUT' : null;
    this.lastPred = { time: last.time, prob, side, threshold: thr };

    // linha de raciocínio: o que li, o que pesou, o que decidi
    const names = featureNames(this.groups);
    const ex = this.model.explain(f);
    const items = ex.items
      .map((it, j) => ({ feature: names[j], value: f[j], z: it.z, weight: it.weight, contribution: it.contribution }))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    this.lastExplain = { time: last.time, prob, bias: ex.bias, items };
    const top = items.slice(0, 3);

    this.think(
      'read',
      `${hhmm(last.time + this.g)} · Li ${this.cfg.name} em ${tfLabel(this.g)}: ${fmt(prob * 100, 1)}% de chance de alta (${sgn(dev * 100, 1)} pp de 50%).`,
    );
    this.think(
      'weights',
      `Mais pesaram: ${top.map((t) => `${t.feature} ${sgn(t.contribution)} (${t.contribution >= 0 ? 'para alta' : 'para baixa'})`).join(' · ')}.`,
    );

    if (!side) {
      this.think('decision', `Não entro: a leitura está dentro de ±${fmt(thr * 100, 0)} pp de 50%. Ficar fora também é uma decisão.`);
      return;
    }

    const why = (reason: string) => {
      this.lastPred!.reason = reason;
      this.think('decision', `Teria sinal de ${side === 'CALL' ? 'alta' : 'baixa'}, mas não abro: ${reason.toLowerCase()}.`);
    };
    if (now - (last.time + this.g) > FRESH_S) return why('Dados defasados');
    if (this.st.signals.some((s) => s.status === 'open')) return why('Sinal anterior ainda aberto');
    const id = `${this.cfg.symbol}-${last.time}`;
    if (this.st.signals.some((s) => s.id === id)) return;

    const q = await getPayoutQuote(derivPublic, this.cfg.symbol, this.cfg.durationMin);
    if (q) this.payoutRatio = q.ratio;
    if (!this.payoutRatio) return why('Sem cotação de payout');

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
    sig.why = top.map((t) => ({ feature: t.feature, c: t.contribution }));
    this.st.signals.push(sig);
    if (this.st.signals.length > LIMITS.maxSignalsStored) this.st.signals.shift();
    this.log('signal', `${side === 'CALL' ? 'Alta' : 'Baixa'} · confiança ${fmt(Math.abs(dev) * 100, 1)} pp · entrada ${last.close}`);
    this.think(
      'decision',
      `Abro sinal de ${side === 'CALL' ? 'ALTA' : 'BAIXA'}: ${fmt(Math.abs(dev) * 100, 1)} pp acima do limiar de ${fmt(thr * 100, 0)} pp. Vence em ${this.cfg.durationMin} min · payout ${fmt(this.payoutRatio * 100, 0)}%.`,
    );
    this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'signal' });
  }

  // ---- liquidação e aprendizado com o resultado -----------------------------
  private settle(now: number, quiet = false): number {
    let count = 0;
    this.st.signals = this.st.signals.map((s) => {
      if (s.status !== 'open') return s;
      const r = resolveSignal(s, this.candleAt(s.expiresAt - this.g), now, this.g);
      if (r !== s) {
        count++;
        if (r.status === 'win' || r.status === 'loss') wallet.settle({ ...r, status: r.status }, this.cfg.name);
        const label = r.status === 'win' ? 'WIN' : r.status === 'loss' ? 'LOSS' : 'Anulado';
        this.log('settled', `${label} · ${r.side === 'CALL' ? 'Alta' : 'Baixa'} ${r.entryPrice} → ${r.exitPrice ?? '—'}`);
        if (!quiet) {
          this.think(
            'result',
            `Sinal de ${r.side === 'CALL' ? 'alta' : 'baixa'} encerrou: ${label}. Entrada ${r.entryPrice}, saída ${r.exitPrice ?? '—'}${r.status === 'win' ? '' : r.status === 'loss' ? '. Registro o erro e sigo.' : ''}`,
          );
        }
      }
      return r;
    });
    if (count > 0) {
      this.adaptThreshold();
      this.persistState();
      this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'settled' });
    }
    return count;
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
      const txt = `Seletividade ${(before * 100).toFixed(0)} → ${(this.st.threshold * 100).toFixed(0)} pp (últimos ${ADAPT_WINDOW}: ${(wr * 100).toFixed(0)}% vs empate ${(be * 100).toFixed(0)}%)`;
      this.log('threshold', txt);
      this.think('system', `Ajustei a seletividade com base nos meus resultados: ${txt}.`);
    }
  }

  // ---- aprendizado: para frente (retreino) e para trás (histórico) ----------
  private retrain(reason: string) {
    const window = this.closed.slice(-this.trainSize);
    const ds = buildDataset(window, this.horizon, this.groups);
    if (ds.X.length < 300) return;
    const model = new LogisticModel().fit(ds.X, ds.y);
    this.model = model;
    this.samples = ds.X.length;
    this.weights = featureNames(this.groups).map((f, j) => ({ feature: f, weight: model.w[j] }));
    this.candlesSinceTrain = 0;
    this.lastTrainAt = Math.floor(Date.now() / 1000);
    this.st.retrains++;
    this.st.builds++;
    this.log('retrain', `${reason} · build ${this.st.builds} · ${ds.X.length} amostras`);
    this.persistState();
  }

  private async maybeBackfill() {
    if (this.exhausted || this.closed.length >= this.maxHistory) return;
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
    if (this.exhausted || this.closed.length >= this.maxHistory) {
      void this.runBacktest('Validação sobre o histórico completo');
    }
  }

  private async runBacktest(reason: string) {
    if (this.btRunning) return;
    this.btRunning = true;
    this.candlesSinceBacktest = 0;
    try {
      const candles = this.closed.slice(-this.maxHistory);
      const ratio = this.payoutRatio ?? 0.85;
      const res = await walkForwardAsync(candles, {
        horizon: this.horizon,
        trainSize: this.trainSize,
        testSize: this.testSize,
        threshold: this.cfg.baseThreshold,
        payoutRatio: ratio,
        groups: this.groups,
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
      this.saveBacktest();
      const s = res.summary;
      (this.st.validations ??= []).push({ at: this.bt.at, build: this.st.builds, n: s.trades, winRate: s.winRate, breakEven: s.breakEven });
      if (this.st.validations.length > 120) this.st.validations.shift();
      this.persistState();
      this.log('backtest', `${reason} · ${s.trades.toLocaleString('pt-BR')} operações fora da amostra · acerto ${(s.winRate * 100).toFixed(1)}%`);
      this.think(
        'result',
        `${reason}: refiz o teste no passado (treino só em dados anteriores a cada janela). ${s.trades.toLocaleString('pt-BR')} operações, acerto ${fmt(s.winRate * 100, 1)}% contra ${fmt(s.breakEven * 100, 1)}% de empate.`,
      );
      this.emit({ type: 'update', symbol: this.cfg.symbol, reason: 'learning' });
    } finally {
      this.btRunning = false;
    }
  }

  // ---- persistência ---------------------------------------------------------
  private loadBacktest(): Backtest | null {
    const raw = readJson<{ trades: number[][]; at: number; candles: number; from: number; to: number; folds: number; payoutRatio: number } | null>(this.backtestFile, null);
    if (!raw?.trades?.length) return null;
    return {
      ...raw,
      trades: raw.trades.map((a) => ({ time: a[0], side: a[1] ? 'CALL' : 'PUT', win: !!a[2], prob: a[3], pnl: a[4] })),
    };
  }

  private saveBacktest() {
    if (!this.bt) return;
    writeJson(
      this.backtestFile,
      { ...this.bt, trades: this.bt.trades.map((t) => [t.time, t.side === 'CALL' ? 1 : 0, t.win ? 1 : 0, +t.prob.toFixed(4), +t.pnl.toFixed(4)]) },
      { backup: false },
    );
  }

  private persistState() {
    this.lastPersistAt = Math.floor(Date.now() / 1000);
    this.st.lastSeen = this.lastPersistAt;
    writeJson(this.stateFile, this.st);
  }

  private persistCandles() {
    writeJson(
      this.candleFile,
      this.closed.map((k) => [k.time, k.open, k.high, k.low, k.close]),
      { backup: false },
    );
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

  // ---- acesso para outros módulos (pesquisa, plano) -------------------------
  /** Velas fechadas em memória (somente leitura). */
  closedCandles(): readonly Candle[] {
    return this.closed;
  }

  get isReady() {
    return this.ready;
  }

  /** terminou de baixar todo o histórico que pretende usar? */
  get backfillDone() {
    return this.exhausted || this.closed.length >= this.maxHistory;
  }

  get signals(): Signal[] {
    return this.st.signals;
  }

  get builds() {
    return this.st.builds;
  }

  get currentPayout() {
    return this.payoutRatio;
  }

  /** Sinais históricos (retroativos + ao vivo) no formato do mapa de horários. */
  tradesForHours(): { at: number; win: boolean; pnl: number }[] {
    const retro = (this.bt?.trades ?? []).map((t) => ({ at: t.time + this.g, win: t.win, pnl: t.pnl }));
    const since = retro.length ? retro[retro.length - 1].at : 0;
    const live = this.st.signals
      .filter((s) => (s.status === 'win' || s.status === 'loss') && s.issuedAt > since)
      .map((s) => ({ at: s.issuedAt, win: s.status === 'win', pnl: s.pnl ?? 0 }));
    return [...retro, ...live];
  }

  /** Estatística de referência para o plano: ao vivo se já houver amostra, senão retroativa. */
  referenceStats() {
    const snap = this.statsPair();
    const live = snap.live;
    const useLive = live.n >= 100;
    const s = useLive ? live : (snap.retro ?? live);
    return { ...s, source: useLive ? ('ao vivo' as const) : ('retroativa' as const) };
  }

  private statsPair() {
    const ratio = this.payoutRatio ?? 0.85;
    const settled = this.st.signals.filter((s) => s.status === 'win' || s.status === 'loss');
    const live = perfStats(
      settled.map((s) => ({ win: s.status === 'win', pnl: s.pnl ?? 0 })),
      settled.length ? settled.reduce((a, s) => a + s.payoutRatio, 0) / settled.length : ratio,
    );
    const retro = this.bt ? perfStats(this.bt.trades, this.bt.payoutRatio) : null;
    return { live, retro };
  }

  // ---- visão para a API -----------------------------------------------------
  snapshot() {
    const now = Math.floor(Date.now() / 1000);
    const ratio = this.payoutRatio ?? 0.85;
    const settled = this.st.signals.filter((s) => s.status === 'win' || s.status === 'loss');
    const { live, retro } = this.statsPair();
    const bt = this.bt;

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

    const hours = hourStats(this.tradesForHours());
    const tot = hours.reduce((a, h) => ({ n: a.n + h.n, w: a.w + h.wins }), { n: 0, w: 0 });
    const hourNow = rateHour(hours, new Date().getHours(), tot.n ? tot.w / tot.n : 0.5);

    return {
      now,
      config: { ...this.cfg, horizon: this.horizon },
      toolkit: {
        granularity: this.g,
        durationMin: this.cfg.durationMin,
        setId: this.cfg.setId ?? 'default',
        groups: this.groups,
        label: toolkitLabel({ granularity: this.g, durationMin: this.cfg.durationMin, setId: this.cfg.setId ?? 'default', groups: this.groups }),
      },
      builds: this.st.builds,
      validations: this.st.validations ?? [],
      lastSeen: this.st.lastSeen,
      resume: this.resumeInfo,
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
      explain: this.lastExplain,
      thoughts: thoughts.get(this.cfg.symbol, 60),
      hourNow,
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
        historyTarget: this.maxHistory,
        historyFrom: this.closed[0]?.time ?? null,
        historyTo: last?.time ?? null,
        exhausted: this.exhausted,
        trainWindow: this.trainSize,
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
}
