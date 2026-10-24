import type { OhlcBar } from "./indicators";

/** A single OHLCV bar with its timestamp in epoch seconds. */
export interface Candle extends OhlcBar {
  timestamp: number;
  open: number;
  volume: number;
  openInterest?: number;
}

/**
 * The columnar payload the charts endpoints return: parallel arrays rather
 * than a list of candle objects.
 */
export interface ChartSeries {
  timestamp?: Array<number | string>;
  open?: Array<number | string>;
  high?: Array<number | string>;
  low?: Array<number | string>;
  close?: Array<number | string>;
  volume?: Array<number | string>;
  open_interest?: Array<number | string>;
  [key: string]: unknown;
}

/** Epoch seconds from an epoch number, epoch string or ISO/date string. */
export function parseTimestamp(value: number | string): number {
  if (typeof value === "number") {
    return value;
  }

  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    // 13-digit values are milliseconds; anything shorter is already seconds.
    return value.length >= 13 ? Math.floor(numeric / 1000) : numeric;
  }

  return Math.floor(new Date(value).getTime() / 1000);
}

/**
 * Converts a columnar chart response into candles. Rows where any OHLC column
 * is missing are dropped rather than emitted as `NaN`.
 */
export function candlesFromSeries(series: ChartSeries | undefined): Candle[] {
  if (!series) {
    return [];
  }

  const {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    open_interest: oi,
  } = series;
  if (!timestamp || !open || !high || !low || !close) {
    return [];
  }

  const candles: Candle[] = [];

  for (let index = 0; index < close.length; index += 1) {
    const candle: Candle = {
      timestamp: parseTimestamp(timestamp[index]),
      open: Number(open[index]),
      high: Number(high[index]),
      low: Number(low[index]),
      close: Number(close[index]),
      volume: Number(volume?.[index] ?? 0),
      openInterest: oi?.[index] === undefined ? undefined : Number(oi[index]),
    };

    if (
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
    ) {
      candles.push(candle);
    }
  }

  return candles;
}

/**
 * Aggregates 1-minute candles up to a coarser interval by flooring each
 * timestamp to its bucket. Returns the input untouched for `minutes <= 1`.
 */
export function resample(candles: Candle[], minutes: number): Candle[] {
  if (minutes <= 1) {
    return candles;
  }

  const bucketSeconds = minutes * 60;
  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const key = Math.floor(candle.timestamp / bucketSeconds) * bucketSeconds;
    const bucket = buckets.get(key);

    if (!bucket) {
      buckets.set(key, { ...candle, timestamp: key });
      continue;
    }

    bucket.high = Math.max(bucket.high, candle.high);
    bucket.low = Math.min(bucket.low, candle.low);
    bucket.close = candle.close;
    bucket.volume += candle.volume;
    bucket.openInterest = candle.openInterest ?? bucket.openInterest;
  }

  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function closes(candles: Candle[]): number[] {
  return candles.map((candle) => candle.close);
}

export function highs(candles: Candle[]): number[] {
  return candles.map((candle) => candle.high);
}

export function lows(candles: Candle[]): number[] {
  return candles.map((candle) => candle.low);
}

export function volumes(candles: Candle[]): number[] {
  return candles.map((candle) => candle.volume);
}
