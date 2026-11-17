import { EventEmitter } from 'node:events';
import { derivPublic } from '../deriv/client.js';
import { getActiveSymbols } from '../deriv/market.js';
import { Researcher } from './researcher.js';
import { LIMITS, SymbolEngine } from './symbolEngine.js';
import { readJson, writeJson } from './store.js';
import { thoughts } from './thoughts.js';
import type { Toolkit } from './toolkit.js';
import type { EngineEvent, WatchItem } from './types.js';
import { wallet } from './wallet.js';

const WATCHLIST_FILE = 'watchlist.json';
export const MAX_WATCH = LIMITS.maxWatch;

const DEFAULT_WATCH: WatchItem = {
  symbol: 'frxEURUSD',
  name: 'EUR/USD',
  granularity: 300,
  durationMin: 15,
  baseThreshold: 0.03,
};

/** Gerencia um motor de sinais por ativo, a bancada de pesquisa e repassa os eventos para o stream SSE. */
class EngineManager extends EventEmitter {
  private engines = new Map<string, SymbolEngine>();
  readonly research: Researcher;

  constructor() {
    super();
    this.research = new Researcher({
      engine: (s) => this.engines.get(s),
      reconfigure: (s, tk) => this.reconfigure(s, tk),
      emit: (e) => this.emit('event', e),
    });
    thoughts.on('thought', (t) => this.emit('event', { type: 'thought', symbol: t.symbol, thought: t } satisfies EngineEvent));
  }

  async boot() {
    const items = readJson<WatchItem[]>(WATCHLIST_FILE, []);
    for (const it of items.length ? items : [DEFAULT_WATCH]) this.start(it);
    this.persist();

    // Carteira: sinais já liquidados entram na ordem em que venceram (idempotente por id).
    const done = [...this.engines.values()]
      .flatMap((e) => e.signals.map((s) => ({ s, name: e.cfg.name })))
      .filter((x) => x.s.status === 'win' || x.s.status === 'loss')
      .sort((a, b) => (a.s.settledAt ?? 0) - (b.s.settledAt ?? 0));
    for (const { s, name } of done) {
      wallet.settle({ ...s, status: s.status as 'win' | 'loss' }, name);
    }
  }

  private start(item: WatchItem) {
    const eng = new SymbolEngine(item, (e: EngineEvent) => this.emit('event', e));
    this.engines.set(item.symbol, eng);
    eng.start();
    this.research.watch(item.symbol);
  }

  list(): WatchItem[] {
    return [...this.engines.values()].map((e) => e.cfg);
  }

  get(symbol: string) {
    return this.engines.get(symbol);
  }

  add(item: WatchItem) {
    if (this.engines.has(item.symbol)) return;
    if (this.engines.size >= MAX_WATCH) throw new Error(`Limite de ${MAX_WATCH} ativos monitorados`);
    this.start(item);
    this.persist();
  }

  remove(symbol: string) {
    const e = this.engines.get(symbol);
    if (!e) return;
    if (this.engines.size === 1) throw new Error('Mantenha ao menos um ativo monitorado');
    e.stop();
    this.research.unwatch(symbol);
    this.engines.delete(symbol);
    this.persist();
  }

  /** A bancada promoveu uma configuração (tempo gráfico, expiração, indicadores): troca o motor do ativo. */
  reconfigure(symbol: string, tk: Toolkit) {
    const old = this.engines.get(symbol);
    if (!old) return;
    old.stop();
    const item: WatchItem = { ...old.cfg, granularity: tk.granularity, durationMin: tk.durationMin, groups: tk.groups, setId: tk.setId };
    const eng = new SymbolEngine(item, (e: EngineEvent) => this.emit('event', e));
    this.engines.set(symbol, eng);
    eng.start();
    this.persist();
    this.emit('event', { type: 'update', symbol, reason: 'version' } satisfies EngineEvent);
  }

  async symbolName(symbol: string): Promise<string> {
    try {
      return (await getActiveSymbols(derivPublic)).find((s) => s.symbol === symbol)?.name ?? symbol;
    } catch {
      return symbol;
    }
  }

  /** Grava tudo que está em memória (usado ao desligar o servidor). */
  flush() {
    for (const e of this.engines.values()) e.stop();
    thoughts.flush();
  }

  private persist() {
    writeJson(WATCHLIST_FILE, this.list());
  }
}

export const engine = new EngineManager();
