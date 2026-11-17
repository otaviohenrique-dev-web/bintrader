import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, RetroTrade, Signal } from '../api';
import { price } from '../lib/format';
import Icon from './Icon';

const C = {
  up: '#25c08a',
  down: '#ef5b67',
  gold: '#d6b36a',
  text: '#6a7485',
  grid: 'rgba(255,255,255,0.035)',
  upDim: 'rgba(37,192,138,0.5)',
  downDim: 'rgba(239,91,103,0.5)',
};

/** O gráfico mostra UTC; deslocamos para o fuso local do usuário. */
const toT = (t: number) => (t - new Date(t * 1000).getTimezoneOffset() * 60) as UTCTimestamp;

interface Props {
  candles: Candle[];
  signals: Signal[];
  retro: RetroTrade[];
  showRetro: boolean;
  granularity: number;
  horizon: number;
  digits: number;
}

export interface Hover {
  open: number;
  high: number;
  low: number;
  close: number;
}

export default function PriceChart({ candles, signals, retro, showRetro, granularity, horizon, digits }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const line = useRef<IPriceLine | null>(null);
  const prev = useRef<{ len: number; first: number } | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // criação única
  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: C.text,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 11,
      },
      localization: {
        locale: 'pt-BR',
        priceFormatter: (p: number) =>
          p.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(214,179,106,0.4)', labelBackgroundColor: '#272e3a', style: LineStyle.Dashed },
        horzLine: { color: 'rgba(214,179,106,0.4)', labelBackgroundColor: '#272e3a', style: LineStyle.Dashed },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.22, bottom: 0.1 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 7, barSpacing: 9 },
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: C.up,
      downColor: C.down,
      wickUpColor: C.up,
      wickDownColor: C.down,
      borderVisible: false,
      priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits },
    });
    c.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(s) as CandlestickData<Time> | undefined;
      setHover(d ? { open: d.open, high: d.high, low: d.low, close: d.close } : null);
    });
    chart.current = c;
    series.current = s;
    markers.current = createSeriesMarkers(s, []);
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      markers.current = null;
      line.current = null;
      prev.current = null;
    };
  }, [digits]);

  // velas (atualização incremental quando só a última mudou)
  useEffect(() => {
    const s = series.current;
    if (!s || candles.length === 0) return;
    const data = candles.map((k) => ({ time: toT(k.time), open: k.open, high: k.high, low: k.low, close: k.close }));
    const p = prev.current;
    if (p && data[0].time === p.first && (data.length === p.len || data.length === p.len + 1)) {
      if (data.length === p.len + 1) s.update(data[data.length - 2]);
      s.update(data[data.length - 1]);
    } else {
      s.setData(data);
      if (!p) {
        chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - 96), to: data.length + 7 });
      }
    }
    prev.current = { len: data.length, first: data[0].time as number };
  }, [candles, digits]);

  // marcadores: sinais ao vivo + (opcional) retroativos
  useEffect(() => {
    const m = markers.current;
    if (!m || candles.length === 0) return;
    const t0 = candles[0].time;
    const out: SeriesMarker<Time>[] = [];

    if (showRetro) {
      for (const r of retro) {
        if (r.time < t0) continue;
        out.push({
          time: toT(r.time),
          position: r.side === 'CALL' ? 'belowBar' : 'aboveBar',
          shape: 'circle',
          size: 0.5,
          color: r.win ? C.upDim : C.downDim,
        });
      }
    }
    const labelled = new Set(signals.slice(-3).map((x) => x.id)); // evita texto sobreposto em sinais emendados
    for (const s of signals) {
      if (s.entryTime < t0) continue;
      out.push({
        time: toT(s.entryTime),
        position: s.side === 'CALL' ? 'belowBar' : 'aboveBar',
        shape: s.side === 'CALL' ? 'arrowUp' : 'arrowDown',
        color: s.side === 'CALL' ? C.up : C.down,
        size: 1.3,
        text: labelled.has(s.id) ? `${(s.confidence * 100 + 50).toFixed(0)}%` : undefined,
      });
      if (s.status === 'win' || s.status === 'loss') {
        out.push({
          time: toT(s.expiresAt - granularity),
          position: 'inBar',
          shape: 'circle',
          color: s.status === 'win' ? C.up : C.down,
          size: 1,
          text: s.status === 'win' ? 'WIN' : 'LOSS',
        });
      }
    }
    out.sort((a, b) => (a.time as number) - (b.time as number));
    m.setMarkers(out);
  }, [signals, retro, showRetro, candles, granularity, horizon]);

  // linha de entrada do sinal aberto
  const open = signals.find((s) => s.status === 'open');
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    if (line.current) {
      s.removePriceLine(line.current);
      line.current = null;
    }
    if (open) {
      line.current = s.createPriceLine({
        price: open.entryPrice,
        color: C.gold,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Entrada',
      });
    }
  }, [open?.id, digits]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetView = () => {
    const n = candles.length;
    chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 96), to: n + 7 });
  };

  return (
    <>
      <div className="chart-body" ref={host} />
      {hover && (
        <div
          className="ohlc"
          style={{ position: 'absolute', left: 18, top: 78, zIndex: 3, pointerEvents: 'none' }}
        >
          <span>A <b className="mono">{price(hover.open, digits)}</b></span>
          <span>M <b className="mono">{price(hover.high, digits)}</b></span>
          <span>m <b className="mono">{price(hover.low, digits)}</b></span>
          <span>F <b className="mono">{price(hover.close, digits)}</b></span>
        </div>
      )}
      <button
        className="icon-btn"
        style={{ position: 'absolute', right: 70, bottom: 60, zIndex: 3 }}
        onClick={resetView}
        title="Voltar às últimas velas"
        aria-label="Voltar às últimas velas"
      >
        <Icon name="reset" size={14} />
      </button>
    </>
  );
}
