import { config } from '../config.js';

export class DerivError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DerivError';
  }
}

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Cliente mínimo para o WebSocket da Deriv: correlaciona respostas por req_id,
 * reconecta sob demanda e expira requisições penduradas.
 * Por padrão usa o endpoint PÚBLICO (somente leitura: candles, símbolos, cotações).
 */
export class DerivClient {
  private ws?: WebSocket;
  private opening?: Promise<void>;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(private url: string = config.derivPublicWs) {}

  private open(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.opening) return this.opening;

    this.opening = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout ao conectar na Deriv'));
      }, 10_000);
      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Falha na conexão WebSocket com a Deriv'));
      };
      ws.onmessage = (ev) => this.onMessage(String(ev.data));
      ws.onclose = () => {
        if (this.ws === ws) this.ws = undefined;
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error('Conexão com a Deriv encerrada'));
          this.pending.delete(id);
        }
      };
    }).finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  private onMessage(raw: string) {
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const p = this.pending.get(data.req_id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(data.req_id);
    if (data.error) p.reject(new DerivError(data.error.code, data.error.message));
    else p.resolve(data);
  }

  async request<T = any>(payload: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
    await this.open();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout na requisição ${Object.keys(payload)[0]}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ ...payload, req_id: id }));
    });
  }

  close() {
    this.ws?.close();
  }
}

export const derivPublic = new DerivClient();
