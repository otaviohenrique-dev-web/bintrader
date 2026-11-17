import { walkForwardAsync } from '../ai/aegis.js';
import { summarize } from '../backtest/stats.js';
import { derivPublic } from '../deriv/client.js';
import { getCandles, getPayoutQuote, type Candle } from '../deriv/market.js';
import { readJson, writeJson } from './store.js';
import { LIMITS, type SymbolEngine } from './symbolEngine.js';
import { thoughts } from './thoughts.js';
import {
  DEFAULT_TOOLKIT, DURATIONS, experimentGrid, maxHistoryFor, nextVersion, testWindowFor, tfLabel,
  toolkitKey, toolkitLabel, trainWindowFor, versionLabel, type Toolkit,
} from './toolkit.js';
import type { EngineEvent } from './types.js';

/**
 * BANCADA DE PESQUISA da Aegis IA.
 *
 * Em segundo plano, a IA testa configurações (tempo gráfico × expiração × conjunto de indicadores),
 * mostrando cada passo na linha de raciocínio. Para não se enganar:
 *  1. Os dados mais recentes (30%) ficam num COFRE definido uma única vez e nunca usado para escolher.
 *  2. Cada hipótese é medida só no passado (walk-forward), com α corrigido pelo nº de hipóteses (Bonferroni).
 *  3. A melhor hipótese é conferida no cofre uma única vez, contra a configuração atual.
 *  4. Só vira a nova configuração (e a versão sobe) se passar no cofre com significância.
 */

export interface Experiment {
  key: string;
  label: string;
  granularity: number;
  durationMin: number;
  setId: string;
  n: number;
  wins: number;
  winRate: number;
  ci95: [number, number];
  breakEven: number;
  pValue: number;
  /** esperança por operação, em stakes */
  ev: number;
  /** (acerto − empate) em pontos percentuais */
  marginPp: number;
  /** passa do α corrigido para o nº de hipóteses? */
  significant: boolean;
  at: number;
}

export interface VaultResult {
  key: string;
  label: string;
  n: number;
  winRate: number;
  ci95: [number, number];
  breakEven: number;
  pValue: number;
}

export interface CycleSummary {
  cycle: number;
  at: number;
  tests: number;
  alpha: number;
  aboveBreakEven: number;
  significant: number;
  best: { key: string; label: string; winRate: number; marginPp: number; devN: number } | null;
  vault: { challenger: VaultResult; champion: VaultResult | null; alpha: number; looks: number } | null;
  decision: 'promovida' | 'mantida' | 'atual-e-a-melhor' | 'sem-cofre' | 'sem-dados';
  note: string;
}

export interface VersionRec {
  version: number;
  label: string;
  at: number;
  build: number;
  winRate: number | null;
  n: number | null;
  deltaPp: number;
  toolkit: string;
  note: string;
}

export interface ResearchState {
  cycles: number;
  lastCycleAt: number;
  /** início do cofre por tempo gráfico (definido uma vez; o cofre cresce com o tempo) */
  vaultStart: Record<string, number>;
  vaultLooks: number;
  experiments: Experiment[];
  history: CycleSummary[];
  champion: Toolkit;
  versions: VersionRec[];
}

interface Runtime {
  running: boolean;
  i: number;
  k: number;
  current: string | null;
}

export interface ResearchHost {
  engine(symbol: string): SymbolEngine | undefined;
  reconfigure(symbol: string, tk: Toolkit): void;
  emit(e: EngineEvent): void;
}

const EVERY_MS = LIMITS.researchEveryHours * 3600_000;
const MIN_TRADES_BEST = 300;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const pctS = (v: number, d = 1) => `${fmt(v * 100, d)}%`;

const initialVersion = (): VersionRec => ({
  version: 1.1,
  label: versionLabel(1.1),
  at: Math.floor(Date.now() / 1000),
  build: 0,
  winRate: null,
  n: null,
  deltaPp: 0,
  toolkit: toolkitLabel(DEFAULT_TOOLKIT),
  note: 'Versão inicial: estudo de laboratório + sinais ao vivo.',
});

export class Researcher {
  private states = new Map<string, ResearchState>();
  private runtime = new Map<string, Runtime>();
  private timers = new Map<string, NodeJS.Timeout>();
  private queue: string[] = [];
  private working = false;

  constructor(private host: ResearchHost) {}

  private file(symbol: string) {
    return `research-${symbol}.json`;
  }

  private state(symbol: string): ResearchState {
    let s = this.states.get(symbol);
    if (!s) {
      const saved = readJson<Partial<ResearchState>>(this.file(symbol), {});
      s = {
        // ciclos interrompidos (sem histórico) não contam
        cycles: saved.history?.length ? (saved.cycles ?? 0) : 0,
        lastCycleAt: saved.lastCycleAt ?? 0,
        vaultStart: saved.vaultStart ?? {},
        vaultLooks: saved.vaultLooks ?? 0,
        experiments: saved.experiments ?? [],
        history: saved.history ?? [],
        champion: saved.champion ?? DEFAULT_TOOLKIT,
        versions: saved.versions?.length ? saved.versions : [initialVersion()],
      };
      this.states.set(symbol, s);
    }
    return s;
  }

  private save(symbol: string) {
    writeJson(this.file(symbol), this.state(symbol));
  }

  private rt(symbol: string): Runtime {
    let r = this.runtime.get(symbol);
    if (!r) this.runtime.set(symbol, (r = { running: false, i: 0, k: 0, current: null }));
    return r;
  }

  private think(symbol: string, kind: Parameters<typeof thoughts.think>[1], text: string) {
    thoughts.think(symbol, kind, text);
  }

  private changed(symbol: string, reason: 'research' | 'version' = 'research') {
    this.host.emit({ type: 'update', symbol, reason });
  }

  // ---- agendamento ----------------------------------------------------------
  watch(symbol: string) {
    this.state(symbol);
    this.schedule(symbol, true);
  }

  unwatch(symbol: string) {
    const t = this.timers.get(symbol);
    if (t) clearTimeout(t);
    this.timers.delete(symbol);
    this.queue = this.queue.filter((s) => s !== symbol);
  }

  private schedule(symbol: string, first = false) {
    const t = this.timers.get(symbol);
    if (t) clearTimeout(t);
    const st = this.state(symbol);
    const due = st.lastCycleAt * 1000 + EVERY_MS - Date.now();
    const delay = first ? Math.max(60_000, due) : Math.max(60_000, EVERY_MS);
    this.timers.set(symbol, setTimeout(() => this.enqueue(symbol), delay));
  }

  /** Dispara um ciclo agora (botão da tela). */
  runNow(symbol: string) {
    this.enqueue(symbol);
  }

  private enqueue(symbol: string) {
    if (this.queue.includes(symbol) || this.rt(symbol).running) return;
    this.queue.push(symbol);
    void this.drain();
  }

  private async drain() {
    if (this.working) return;
    this.working = true;
    try {
      while (this.queue.length) {
        const symbol = this.queue.shift()!;
        try {
          await this.cycle(symbol);
        } catch (e) {
          this.think(symbol, 'system', `A pesquisa parou por um erro: ${(e as Error).message}. Tento de novo no próximo ciclo.`);
        } finally {
          this.rt(symbol).running = false;
          this.rt(symbol).current = null;
          this.changed(symbol);
          this.schedule(symbol);
        }
      }
    } finally {
      this.working = false;
    }
  }

  // ---- dados ---------------------------------------------------------------
  private async candlesFor(symbol: string, gran: number, eng: SymbolEngine, cache: Map<number, Candle[]>): Promise<Candle[]> {
    const hit = cache.get(gran);
    if (hit) return hit;
    let out: Candle[];
    if (gran === eng.cfg.granularity) {
      out = [...eng.closedCandles()];
    } else {
      const file = `candles-${symbol}-${gran}.json`;
      const m = new Map<number, Candle>();
      for (const a of readJson<number[][]>(file, [])) m.set(a[0], { time: a[0], open: a[1], high: a[2], low: a[3], close: a[4] });
      const target = maxHistoryFor(gran);
      const now = Math.floor(Date.now() / 1000);
      let fresh: Candle[] = [];
      if (m.size < target * 0.85) fresh = await getCandles(derivPublic, symbol, gran, target);
      else {
        const last = Math.max(...m.keys());
        const gap = Math.ceil((now - last) / gran);
        if (gap > 3) fresh = await getCandles(derivPublic, symbol, gran, Math.min(gap + 5, 5000));
      }
      for (const k of fresh) m.set(k.time, k);
      out = [...m.values()].sort((a, b) => a.time - b.time);
      writeJson(file, out.map((k) => [k.time, k.open, k.high, k.low, k.close]), { backup: false });
    }
    cache.set(gran, out);
    return out;
  }

  /** O cofre é definido na primeira vez que um tempo gráfico é usado e nunca mais muda. */
  private vaultStart(symbol: string, gran: number, candles: Candle[]): number {
    const st = this.state(symbol);
    const k = String(gran);
    if (st.vaultStart[k] === undefined) {
      st.vaultStart[k] = candles[Math.floor(candles.length * (1 - LIMITS.vaultShare))].time;
      this.save(symbol);
    }
    return st.vaultStart[k];
  }

  // ---- um ciclo de pesquisa ------------------------------------------------------
  private async cycle(symbol: string) {
    const eng = this.host.engine(symbol);
    const st = this.state(symbol);
    const rt = this.rt(symbol);
    if (!eng || !eng.isReady || !eng.backfillDone) {
      this.think(symbol, 'system', 'Adio a pesquisa: ainda estou terminando de baixar e validar o histórico.');
      this.timers.set(symbol, setTimeout(() => this.enqueue(symbol), 90_000));
      return;
    }
    rt.running = true;
    const grid = experimentGrid();
    const alpha = 0.05 / grid.length;
    const cycleNo = st.cycles + 1; // só conta como ciclo quando terminar
    rt.k = grid.length;
    rt.i = 0;
    const cache = new Map<number, Candle[]>();
    const champKey = toolkitKey(st.champion);

    this.think(
      symbol,
      'tool',
      `Ciclo de pesquisa nº ${cycleNo}: vou testar ${grid.length} configurações (tempos gráficos × expirações × conjuntos de indicadores). ` +
        `Para não me enganar, os ${Math.round(LIMITS.vaultShare * 100)}% de dados mais recentes ficam num cofre que não uso para escolher. ` +
        `Com ${grid.length} tentativas, só aceito como evidência o que passar de α = ${fmt(alpha * 100, 3)}%.`,
    );

    // cotação real de cada expiração (o empate muda com o payout)
    const ratios = new Map<number, number>();
    for (const d of DURATIONS) {
      const q = await getPayoutQuote(derivPublic, symbol, d);
      ratios.set(d, q?.ratio ?? eng.currentPayout ?? 0.8);
    }

    const exps: Experiment[] = [];
    for (const tk of grid) {
      rt.i++;
      const label = toolkitLabel(tk);
      rt.current = label;
      this.changed(symbol);
      const ratio = ratios.get(tk.durationMin) ?? 0.8;
      const train = trainWindowFor(tk.granularity);
      try {
        const candles = await this.candlesFor(symbol, tk.granularity, eng, cache);
        if (candles.length < train + 1500) {
          this.think(symbol, 'test', `Hipótese ${rt.i}/${rt.k}: ${label}. Pulei: só há ${candles.length} velas neste tempo gráfico.`);
          continue;
        }
        const vs = this.vaultStart(symbol, tk.granularity, candles);
        const dev = candles.filter((k) => k.time < vs);
        if (dev.length < train + 800) {
          this.think(symbol, 'test', `Hipótese ${rt.i}/${rt.k}: ${label}. Pulei: o período de desenvolvimento ficou curto (${dev.length} velas).`);
          continue;
        }
        this.think(symbol, 'tool', `Hipótese ${rt.i}/${rt.k}: ${label}. Treino em janelas móveis e testo só no futuro de cada uma, em ${dev.length.toLocaleString('pt-BR')} velas (cofre intocado).`);
        const res = await walkForwardAsync(dev, {
          horizon: (tk.durationMin * 60) / tk.granularity,
          trainSize: train,
          testSize: testWindowFor(tk.granularity),
          threshold: 0.03,
          payoutRatio: ratio,
          groups: tk.groups,
        });
        const s = res.summary;
        const exp: Experiment = {
          key: toolkitKey(tk),
          label,
          granularity: tk.granularity,
          durationMin: tk.durationMin,
          setId: tk.setId,
          n: s.trades,
          wins: s.wins,
          winRate: s.winRate,
          ci95: s.ci95,
          breakEven: s.breakEven,
          pValue: s.pValue,
          ev: s.evPerTrade,
          marginPp: (s.winRate - s.breakEven) * 100,
          significant: s.trades >= MIN_TRADES_BEST && s.winRate > s.breakEven && s.pValue < alpha,
          at: Math.floor(Date.now() / 1000),
        };
        exps.push(exp);
        const verdict = exp.n < MIN_TRADES_BEST ? 'amostra curta, sem conclusão' : exp.significant ? 'acima do empate E dentro do critério corrigido' : exp.winRate > exp.breakEven ? 'acima do empate, mas ainda compatível com sorte' : 'abaixo do empate, descarto';
        this.think(symbol, 'result', `${label}: ${exp.n.toLocaleString('pt-BR')} operações, acerto ${pctS(exp.winRate)} (IC ${pctS(exp.ci95[0], 0)}–${pctS(exp.ci95[1], 0)}) contra empate ${pctS(exp.breakEven)} → ${verdict}.`);
        st.experiments = [...exps];
        this.save(symbol);
        this.changed(symbol);
        await sleep(1200); // educação com o resto do sistema
      } catch (e) {
        this.think(symbol, 'test', `Hipótese ${rt.i}/${rt.k}: ${label}. Falhou: ${(e as Error).message}.`);
      }
    }

    // ---- ranking e conferência no cofre -----------------------------------------
    const above = exps.filter((e) => e.n >= MIN_TRADES_BEST && e.winRate > e.breakEven).length;
    const sig = exps.filter((e) => e.significant).length;
    const eligible = exps.filter((e) => e.n >= MIN_TRADES_BEST).sort((a, b) => b.marginPp - a.marginPp);
    const best = eligible[0] ?? null;

    const summary: CycleSummary = {
      cycle: cycleNo,
      at: Math.floor(Date.now() / 1000),
      tests: exps.length,
      alpha,
      aboveBreakEven: above,
      significant: sig,
      best: best ? { key: best.key, label: best.label, winRate: best.winRate, marginPp: best.marginPp, devN: best.n } : null,
      vault: null,
      decision: 'sem-dados',
      note: '',
    };

    // a configuração atual também ganha a baseline de versão, se ainda não tiver
    const champExp = exps.find((e) => e.key === champKey);
    if (champExp && st.versions[0].winRate === null) {
      st.versions[0].winRate = champExp.winRate;
      st.versions[0].n = champExp.n;
    }

    this.think(
      symbol,
      'verdict',
      `Fim dos testes: ${above} de ${exps.length} ficaram acima do ponto de empate e ${sig} passaram do critério corrigido (α = ${fmt(alpha * 100, 3)}%). ` +
        (sig === 0 ? 'Entre tantas tentativas, o esperado por puro acaso é que algumas pareçam boas. Nenhuma convence sozinha.' : 'Vou conferir a melhor no cofre.'),
    );

    if (!best) {
      summary.decision = 'sem-dados';
      summary.note = 'Nenhuma hipótese teve amostra suficiente.';
    } else if (best.key === champKey) {
      summary.decision = 'atual-e-a-melhor';
      summary.note = 'A melhor hipótese é a configuração atual. Nada a trocar.';
      this.think(symbol, 'verdict', `A melhor da bancada é a própria configuração atual (${best.label}, ${pctS(best.winRate)}). Mantenho.`);
    } else {
      const chalTk = grid.find((t) => toolkitKey(t) === best.key)!;
      this.think(symbol, 'verdict', `Melhor da bancada: ${best.label} com ${pctS(best.winRate)} (${best.marginPp >= 0 ? '+' : ''}${fmt(best.marginPp)} pp sobre o empate). Isso pode ser sorte da seleção. Abro o cofre uma única vez para conferir, junto com a configuração atual.`);
      const ratioC = ratios.get(chalTk.durationMin) ?? 0.8;
      const ratioH = ratios.get(st.champion.durationMin) ?? 0.8;
      const chal = await this.vaultEval(symbol, chalTk, ratioC, eng, cache);
      const champ = await this.vaultEval(symbol, st.champion, ratioH, eng, cache);
      if (!chal) {
        summary.decision = 'sem-cofre';
        summary.note = 'O cofre deste tempo gráfico ainda é pequeno. Adio a decisão.';
        this.think(symbol, 'verdict', 'O cofre ainda é pequeno para uma conclusão justa. Adio a decisão para o próximo ciclo.');
      } else {
        st.vaultLooks++;
        const alphaV = 0.05 / st.vaultLooks;
        summary.vault = { challenger: chal, champion: champ, alpha: alphaV, looks: st.vaultLooks };
        const chalExp = best;
        this.think(
          symbol,
          'result',
          `Cofre: ${chal.label} fez ${pctS(chal.winRate)} em ${chal.n} operações novas (na bancada tinha ${pctS(chalExp.winRate)}). ` +
            (champ ? `A configuração atual fez ${pctS(champ.winRate)} no mesmo cofre. ` : '') +
            `Quanto cai do ensaio para o cofre mede o quanto a escolha foi sorte.`,
        );
        const enough = chal.n >= 150;
        const edge = chal.ci95[0] > chal.breakEven && chal.pValue < alphaV;
        const better = !champ || chal.winRate > champ.winRate;
        if (enough && edge && better) {
          const prev = st.versions[st.versions.length - 1];
          const deltaPp = champ ? (chal.winRate - champ.winRate) * 100 : (chal.winRate - chal.breakEven) * 100;
          const v = nextVersion(prev.version, deltaPp);
          st.champion = chalTk;
          st.versions.push({
            version: v,
            label: versionLabel(v),
            at: Math.floor(Date.now() / 1000),
            build: eng.builds,
            winRate: chal.winRate,
            n: chal.n,
            deltaPp,
            toolkit: toolkitLabel(chalTk),
            note: `Passou no cofre (${pctS(chal.winRate)}, p = ${fmt(chal.pValue, 4)} < α ${fmt(alphaV, 4)}).`,
          });
          summary.decision = 'promovida';
          summary.note = `Nova configuração: ${toolkitLabel(chalTk)}. Versão ${prev.label} → ${versionLabel(v)}.`;
          this.think(symbol, 'version', `Passou no cofre com significância. Adoto ${toolkitLabel(chalTk)}: a versão sobe de ${prev.label} para ${versionLabel(v)} (+${fmt(deltaPp, 2)} pp de acerto sobre a anterior).`);
          this.save(symbol);
          this.host.reconfigure(symbol, chalTk);
          this.changed(symbol, 'version');
        } else {
          const why = !enough ? `poucas operações no cofre (${chal.n})` : !edge ? 'o limite inferior do acerto não passa do empate com significância' : 'não superou a configuração atual no cofre';
          summary.decision = 'mantida';
          summary.note = `Não promovida: ${why}.`;
          this.think(symbol, 'verdict', `Decisão: mantenho ${toolkitLabel(st.champion)}. A candidata não convence: ${why}. A versão não muda.`);
        }
      }
    }

    st.cycles = cycleNo;
    st.lastCycleAt = Math.floor(Date.now() / 1000);
    st.history = [...st.history, summary].slice(-20);
    st.experiments = exps;
    this.save(symbol);
  }

  /** Avalia uma configuração SÓ no cofre (dados posteriores ao início do cofre). */
  private async vaultEval(symbol: string, tk: Toolkit, ratio: number, eng: SymbolEngine, cache: Map<number, Candle[]>): Promise<VaultResult | null> {
    const candles = await this.candlesFor(symbol, tk.granularity, eng, cache);
    const vs = this.vaultStart(symbol, tk.granularity, candles);
    const idx = candles.findIndex((k) => k.time >= vs);
    if (idx < 0 || candles.length - idx < 400) return null;
    const train = trainWindowFor(tk.granularity);
    const from = Math.max(0, idx - train - 60);
    const res = await walkForwardAsync(candles.slice(from), {
      horizon: (tk.durationMin * 60) / tk.granularity,
      trainSize: train,
      testSize: testWindowFor(tk.granularity),
      threshold: 0.03,
      payoutRatio: ratio,
      groups: tk.groups,
    });
    const trades = res.trades.filter((t) => t.time >= vs);
    if (trades.length < 30) return null;
    const s = summarize(trades, ratio);
    return { key: toolkitKey(tk), label: toolkitLabel(tk), n: s.trades, winRate: s.winRate, ci95: s.ci95, breakEven: s.breakEven, pValue: s.pValue };
  }

  // ---- leitura para a API --------------------------------------------------------
  version(symbol: string) {
    const st = this.state(symbol);
    const v = st.versions[st.versions.length - 1];
    return { number: v.version, label: v.label, since: v.at };
  }

  summary(symbol: string) {
    const st = this.state(symbol);
    const rt = this.rt(symbol);
    const grid = experimentGrid();
    return {
      cycles: st.cycles,
      lastCycleAt: st.lastCycleAt || null,
      nextCycleAt: st.lastCycleAt ? st.lastCycleAt + LIMITS.researchEveryHours * 3600 : null,
      running: rt.running,
      progress: { i: rt.i, k: rt.k || grid.length, current: rt.current },
      alpha: 0.05 / grid.length,
      tests: grid.length,
      vault: { share: LIMITS.vaultShare, looks: st.vaultLooks, start: st.vaultStart },
      champion: { key: toolkitKey(st.champion), label: toolkitLabel(st.champion), granularity: st.champion.granularity, durationMin: st.champion.durationMin, setId: st.champion.setId, tf: tfLabel(st.champion.granularity) },
      experiments: [...st.experiments].sort((a, b) => b.marginPp - a.marginPp),
      history: st.history.slice(-8),
      versions: st.versions,
    };
  }
}
