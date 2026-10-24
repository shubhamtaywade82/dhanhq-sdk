/**
 * Technical indicators.
 *
 * Every series function returns an array the same length as its input, with
 * `null` in the leading positions where there is not yet enough data. Callers
 * can therefore index indicator output by bar without re-aligning it.
 */

export interface OhlcBar {
  open?: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type IndicatorSeries = Array<number | null>;

/** Simple moving average. */
export function sma(data: number[], period = 20): IndicatorSeries {
  if (data.length === 0 || period < 1) {
    return [];
  }

  return data.map((_, index) => {
    if (index < period - 1) {
      return null;
    }

    const window = data.slice(index - period + 1, index + 1);
    return window.reduce((total, value) => total + value, 0) / period;
  });
}

/** Weighted moving average — linear weights, heaviest on the newest bar. */
export function wma(data: number[], period = 20): IndicatorSeries {
  if (data.length === 0 || period < 1) {
    return [];
  }

  const denominator = (period * (period + 1)) / 2;

  return data.map((_, index) => {
    if (index < period - 1) {
      return null;
    }

    const window = data.slice(index - period + 1, index + 1);
    const weighted = window.reduce(
      (total, value, position) => total + value * (position + 1),
      0,
    );
    return weighted / denominator;
  });
}

/**
 * Exponential moving average. The first value is seeded with the SMA of the
 * opening window, which is the convention the rest of this module assumes.
 */
export function ema(data: number[], period = 20): IndicatorSeries {
  if (data.length === 0 || period < 1) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const values: IndicatorSeries = [];

  data.forEach((price, index) => {
    if (index < period - 1) {
      values.push(null);
      return;
    }

    if (index === period - 1) {
      const window = data.slice(0, index + 1);
      values.push(window.reduce((total, value) => total + value, 0) / period);
      return;
    }

    const previous = values[index - 1] as number;
    values.push((price - previous) * multiplier + previous);
  });

  return values;
}

/** Wilder's relative strength index. */
export function rsi(data: number[], period = 14): IndicatorSeries {
  if (data.length < period + 1 || period < 1) {
    return [];
  }

  const changes = data.slice(1).map((value, index) => value - data[index]);
  const opening = changes.slice(0, period);

  let averageGain =
    opening.filter((change) => change > 0).reduce((a, b) => a + b, 0) / period;
  let averageLoss =
    opening
      .filter((change) => change < 0)
      .reduce((a, b) => a + Math.abs(b), 0) / period;

  const values: IndicatorSeries = new Array(period).fill(null);
  values.push(rsiFromAverages(averageGain, averageLoss));

  for (const change of changes.slice(period)) {
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    values.push(rsiFromAverages(averageGain, averageLoss));
  }

  return values;
}

function rsiFromAverages(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) {
    return 100;
  }

  if (averageGain === 0) {
    return 0;
  }

  return 100 - 100 / (1 + averageGain / averageLoss);
}

export interface MacdResult {
  macdLine: IndicatorSeries;
  signalLine: IndicatorSeries;
  histogram: IndicatorSeries;
}

/** Moving average convergence/divergence. */
export function macd(
  data: number[],
  { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9 } = {},
): MacdResult {
  if (data.length === 0) {
    return { macdLine: [], signalLine: [], histogram: [] };
  }

  const fast = ema(data, fastPeriod);
  const slow = ema(data, slowPeriod);

  const macdLine: IndicatorSeries = data.map((_, index) => {
    const fastValue = fast[index];
    const slowValue = slow[index];
    return fastValue === null || slowValue === null
      ? null
      : fastValue - slowValue;
  });

  // The signal EMA runs over the defined section of the MACD line only, then
  // gets padded back out so both series index by the same bar.
  const defined = macdLine.filter((value): value is number => value !== null);
  const signalRaw = defined.length === 0 ? [] : ema(defined, signalPeriod);
  const signalLine: IndicatorSeries = [
    ...new Array<null>(macdLine.length - signalRaw.length).fill(null),
    ...signalRaw,
  ];

  const histogram: IndicatorSeries = macdLine.map((value, index) => {
    const signal = signalLine[index];
    return value === null || signal === null || signal === undefined
      ? null
      : value - signal;
  });

  return { macdLine, signalLine, histogram };
}

export interface BollingerBandsResult {
  upper: IndicatorSeries;
  middle: IndicatorSeries;
  lower: IndicatorSeries;
}

/** Bollinger bands around an SMA. */
export function bollingerBands(
  data: number[],
  { period = 20, standardDeviations = 2 } = {},
): BollingerBandsResult {
  if (data.length === 0) {
    return { upper: [], middle: [], lower: [] };
  }

  const middle = sma(data, period);
  const upper: IndicatorSeries = [];
  const lower: IndicatorSeries = [];

  data.forEach((_, index) => {
    const mean = middle[index];
    if (mean === null || mean === undefined) {
      upper.push(null);
      lower.push(null);
      return;
    }

    const window = data.slice(index - period + 1, index + 1);
    const variance =
      window.reduce((total, value) => total + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);

    upper.push(mean + standardDeviations * deviation);
    lower.push(mean - standardDeviations * deviation);
  });

  return { upper, middle, lower };
}

/** True range per bar. The first bar falls back to high − low. */
export function trueRanges(bars: OhlcBar[]): number[] {
  return bars.map((bar, index) => {
    if (index === 0) {
      return Math.abs(bar.high - bar.low);
    }

    const previousClose = bars[index - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });
}

/** Average true range, smoothed the Wilder way. */
export function atr(bars: OhlcBar[], period = 14): IndicatorSeries {
  if (bars.length < 2 || period < 1) {
    return [];
  }

  const ranges = trueRanges(bars);
  const values: IndicatorSeries = new Array(bars.length).fill(null);

  if (ranges.length <= period) {
    return values;
  }

  // Seed with the simple mean of the first `period` true ranges, skipping the
  // synthetic first-bar range so the seed matches Wilder's definition.
  let current =
    ranges.slice(1, period + 1).reduce((total, value) => total + value, 0) /
    period;
  values[period] = current;

  for (let index = period + 1; index < ranges.length; index += 1) {
    current = (current * (period - 1) + ranges[index]) / period;
    values[index] = current;
  }

  return values;
}

export interface AdxResult {
  adx: IndicatorSeries;
  plusDi: IndicatorSeries;
  minusDi: IndicatorSeries;
}

/** Average directional index with both directional indicators. */
export function adx(bars: OhlcBar[], period = 14): AdxResult {
  const empty: AdxResult = { adx: [], plusDi: [], minusDi: [] };
  if (bars.length < period * 2) {
    return empty;
  }

  const plusDm: number[] = [0];
  const minusDm: number[] = [0];

  for (let index = 1; index < bars.length; index += 1) {
    const upMove = bars[index].high - bars[index - 1].high;
    const downMove = bars[index - 1].low - bars[index].low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const ranges = trueRanges(bars);
  let smoothTr = ranges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDm = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDm = minusDm.slice(0, period).reduce((a, b) => a + b, 0);

  const adxValues: IndicatorSeries = new Array(bars.length).fill(null);
  const plusDiValues: IndicatorSeries = new Array(bars.length).fill(null);
  const minusDiValues: IndicatorSeries = new Array(bars.length).fill(null);
  const dxValues: number[] = [];

  for (let index = period; index < bars.length; index += 1) {
    smoothTr = smoothTr - smoothTr / period + ranges[index];
    smoothPlusDm = smoothPlusDm - smoothPlusDm / period + plusDm[index];
    smoothMinusDm = smoothMinusDm - smoothMinusDm / period + minusDm[index];

    if (smoothTr === 0) {
      continue;
    }

    const plusDi = 100 * (smoothPlusDm / smoothTr);
    const minusDi = 100 * (smoothMinusDm / smoothTr);
    plusDiValues[index] = plusDi;
    minusDiValues[index] = minusDi;

    const diSum = plusDi + minusDi;
    dxValues.push(diSum === 0 ? 0 : 100 * (Math.abs(plusDi - minusDi) / diSum));

    if (dxValues.length >= period) {
      adxValues[index] =
        dxValues.slice(-period).reduce((a, b) => a + b, 0) / period;
    }
  }

  return { adx: adxValues, plusDi: plusDiValues, minusDi: minusDiValues };
}

export interface StochasticResult {
  k: IndicatorSeries;
  d: IndicatorSeries;
}

/** Stochastic oscillator (%K and its %D moving average). */
export function stochastic(
  bars: OhlcBar[],
  { period = 14, signalPeriod = 3 } = {},
): StochasticResult {
  if (bars.length === 0) {
    return { k: [], d: [] };
  }

  const k: IndicatorSeries = bars.map((bar, index) => {
    if (index < period - 1) {
      return null;
    }

    const window = bars.slice(index - period + 1, index + 1);
    const highest = Math.max(...window.map((entry) => entry.high));
    const lowest = Math.min(...window.map((entry) => entry.low));
    const range = highest - lowest;

    return range === 0 ? 100 : ((bar.close - lowest) / range) * 100;
  });

  const defined = k.filter((value): value is number => value !== null);
  const dRaw = defined.length === 0 ? [] : sma(defined, signalPeriod);
  const d: IndicatorSeries = [
    ...new Array<null>(k.length - dRaw.length).fill(null),
    ...dRaw,
  ];

  return { k, d };
}

export interface SupertrendResult {
  trend: IndicatorSeries;
  /** `1` while price is above the band, `-1` below, `null` before the seed. */
  direction: Array<1 | -1 | null>;
}

/** Supertrend — ATR bands that flip direction when price closes through them. */
export function supertrend(
  bars: OhlcBar[],
  { period = 10, multiplier = 3 } = {},
): SupertrendResult {
  const atrValues = atr(bars, period);
  const trend: IndicatorSeries = new Array(bars.length).fill(null);
  const direction: Array<1 | -1 | null> = new Array(bars.length).fill(null);

  let upperBand = 0;
  let lowerBand = 0;
  let currentDirection: 1 | -1 = 1;

  bars.forEach((bar, index) => {
    const atrValue = atrValues[index];
    if (atrValue === null || atrValue === undefined) {
      return;
    }

    const mid = (bar.high + bar.low) / 2;
    const rawUpper = mid + multiplier * atrValue;
    const rawLower = mid - multiplier * atrValue;
    const previousClose = bars[index - 1]?.close ?? bar.close;

    // Bands only tighten toward price while direction holds; a close through a
    // band is what resets them.
    upperBand =
      rawUpper < upperBand || previousClose > upperBand ? rawUpper : upperBand;
    lowerBand =
      rawLower > lowerBand || previousClose < lowerBand ? rawLower : lowerBand;

    if (bar.close > upperBand) {
      currentDirection = 1;
    } else if (bar.close < lowerBand) {
      currentDirection = -1;
    }

    direction[index] = currentDirection;
    trend[index] = currentDirection === 1 ? lowerBand : upperBand;
  });

  return { trend, direction };
}

/** Volume-weighted average price, cumulative from the first bar. */
export function vwap(bars: OhlcBar[]): IndicatorSeries {
  let cumulativeVolume = 0;
  let cumulativeNotional = 0;

  return bars.map((bar) => {
    const volume = bar.volume ?? 0;
    const typical = (bar.high + bar.low + bar.close) / 3;

    cumulativeVolume += volume;
    cumulativeNotional += typical * volume;

    return cumulativeVolume === 0
      ? null
      : cumulativeNotional / cumulativeVolume;
  });
}

/** On-balance volume. */
export function obv(bars: OhlcBar[]): IndicatorSeries {
  let total = 0;

  return bars.map((bar, index) => {
    if (index === 0) {
      return 0;
    }

    const previousClose = bars[index - 1].close;
    const volume = bar.volume ?? 0;

    if (bar.close > previousClose) {
      total += volume;
    } else if (bar.close < previousClose) {
      total -= volume;
    }

    return total;
  });
}

/** Last non-null value of an indicator series. */
export function latest(series: IndicatorSeries): number | null {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];
    if (value !== null && value !== undefined) {
      return value;
    }
  }

  return null;
}
