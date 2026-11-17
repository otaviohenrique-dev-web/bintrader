// Indicadores técnicos puros. Todos retornam arrays alinhados ao input,
// com NaN no período de aquecimento. Nenhum usa dado futuro.

const nanArray = (n: number) => new Array<number>(n).fill(NaN);

export function sma(v: number[], p: number): number[] {
  const out = nanArray(v.length);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= p) sum -= v[i - p];
    if (i >= p - 1) out[i] = sum / p;
  }
  return out;
}

export function ema(v: number[], p: number): number[] {
  const out = nanArray(v.length);
  const first = v.findIndex((x) => Number.isFinite(x));
  if (first < 0 || v.length - first < p) return out;
  const k = 2 / (p + 1);
  let prev = 0;
  for (let j = first; j < first + p; j++) prev += v[j];
  prev /= p;
  out[first + p - 1] = prev;
  for (let i = first + p; i < v.length; i++) {
    prev = v[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI de Wilder */
export function rsi(close: number[], p = 14): number[] {
  const out = nanArray(close.length);
  if (close.length <= p) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= p; i++) {
    const d = close[i] - close[i - 1];
    if (d >= 0) g += d;
    else l -= d;
  }
  g /= p;
  l /= p;
  out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p;
    l = (l * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function macd(close: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(close, fast);
  const es = ema(close, slow);
  const line = close.map((_, i) => ef[i] - es[i]);
  const sig = ema(line, signal);
  const hist = line.map((x, i) => x - sig[i]);
  return { line, signal: sig, hist };
}

export function bollinger(close: number[], p = 20, k = 2) {
  const mid = sma(close, p);
  const upper = nanArray(close.length);
  const lower = nanArray(close.length);
  for (let i = p - 1; i < close.length; i++) {
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (close[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / p);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
  }
  return { mid, upper, lower };
}

/** ATR de Wilder */
export function atr(high: number[], low: number[], close: number[], p = 14): number[] {
  const n = close.length;
  const out = nanArray(n);
  if (n <= p) return out;
  const tr = nanArray(n);
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1]),
    );
  }
  let a = 0;
  for (let i = 1; i <= p; i++) a += tr[i];
  a /= p;
  out[p] = a;
  for (let i = p + 1; i < n; i++) {
    a = (a * (p - 1) + tr[i]) / p;
    out[i] = a;
  }
  return out;
}

/** Estocástico %K (0–100) */
export function stochK(high: number[], low: number[], close: number[], p = 14): number[] {
  const out = nanArray(close.length);
  for (let i = p - 1; i < close.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - p + 1; j <= i; j++) {
      hh = Math.max(hh, high[j]);
      ll = Math.min(ll, low[j]);
    }
    out[i] = hh === ll ? 50 : ((close[i] - ll) / (hh - ll)) * 100;
  }
  return out;
}
