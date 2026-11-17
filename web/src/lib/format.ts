const nf = (d: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** R$ 1.234,56 */
export const brl = (v: number) => brlFmt.format(v);
/** +R$ 7,90 / −R$ 10,00 */
export const brlSigned = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${brlFmt.format(Math.abs(v))}`;
export const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export const pct =(v: number, d = 1) => `${nf(d).format(v * 100)}%`;
export const num = (v: number, d = 2) => nf(d).format(v);
export const int = (v: number) => new Intl.NumberFormat('pt-BR').format(v);
export const signed = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(d).format(Math.abs(v))}`;

/** Casas decimais conforme a magnitude do preço (forex ~5, índices ~2). */
export const digitsFor = (p: number) => (p >= 1000 ? 2 : p >= 100 ? 3 : p >= 10 ? 4 : 5);
export const price = (v: number, d?: number) => nf(d ?? digitsFor(v)).format(v);

export const hhmm = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const hhmmss = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const dayTime = (t: number) =>
  new Date(t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const dayMonth = (t: number) =>
  new Date(t * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const ago = (t: number, now: number) => {
  const d = Math.max(0, now - t);
  if (d < 60) return 'agora';
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)} h`;
  return `há ${Math.floor(d / 86400)} d`;
};

export const sideLabel = (s: 'CALL' | 'PUT') => (s === 'CALL' ? 'Alta' : 'Baixa');
