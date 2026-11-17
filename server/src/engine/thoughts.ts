import { EventEmitter } from 'node:events';
import { readJson, writeJson } from './store.js';

export type ThoughtKind =
  | 'read' // o que a IA leu agora
  | 'weights' // o que pesou na leitura
  | 'decision' // entrou, não entrou e por quê
  | 'tool' // ferramenta/hipótese escolhida para testar
  | 'test' // teste em andamento
  | 'result' // resultado de um teste
  | 'verdict' // conclusão de um ciclo de pesquisa
  | 'version' // nova versão
  | 'system'; // continuidade, retomada, avisos

export interface Thought {
  id: number;
  at: number; // epoch s
  symbol: string;
  kind: ThoughtKind;
  text: string;
}

const FILE = 'thoughts.json';
const KEEP = 120;

/**
 * Linha de raciocínio da Aegis IA: tudo o que ela lê, testa e decide vira uma frase aqui.
 * Fica em memória, vai para a tela em tempo real (SSE) e é salva em disco para sobreviver a reinícios.
 */
class ThoughtBus extends EventEmitter {
  private buf = new Map<string, Thought[]>();
  private seq = 0;
  private timer?: NodeJS.Timeout;

  constructor() {
    super();
    const saved = readJson<Record<string, Thought[]>>(FILE, {});
    for (const [sym, list] of Object.entries(saved)) {
      this.buf.set(sym, list);
      for (const t of list) this.seq = Math.max(this.seq, t.id);
    }
  }

  think(symbol: string, kind: ThoughtKind, text: string): Thought {
    const t: Thought = { id: ++this.seq, at: Math.floor(Date.now() / 1000), symbol, kind, text };
    const list = this.buf.get(symbol) ?? [];
    list.push(t);
    if (list.length > KEEP) list.shift();
    this.buf.set(symbol, list);
    this.emit('thought', t);
    this.scheduleSave();
    return t;
  }

  get(symbol: string, limit = 80): Thought[] {
    return (this.buf.get(symbol) ?? []).slice(-limit);
  }

  private scheduleSave() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 15_000);
  }

  flush() {
    writeJson(FILE, Object.fromEntries(this.buf));
  }
}

export const thoughts = new ThoughtBus();
