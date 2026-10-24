import { closes } from "../ta/candles";
import type { Candle } from "../ta/candles";
import {
  adx as calcAdx,
  atr as calcAtr,
  bollingerBands,
  ema as calcEma,
  macd as calcMacd,
  rsi as calcRsi,
  sma as calcSma,
  stochastic as calcStochastic,
  supertrend as calcSupertrend,
  vwap as calcVwap,
  type IndicatorSeries,
} from "../ta/indicators";
import {
  analyzeMultiTimeframe,
  type MultiTimeframeSummary,
} from "../ta/multiTimeframe";
import {
  TIMEFRAMES,
  type TechnicalAnalysisResult,
  type TimeframeIndicators,
  type TimeframeKey,
} from "../ta/TechnicalAnalysis";
import type { IndicatorAccessors } from "./types";

export interface SeriesContext {
  candles: Candle[];
  cache: Map<string, unknown>;
}

/** One higher timeframe's precomputed series plus how to find "now" within it. */
export interface TimeframeEntry {
  minutes: number;
  ctx: SeriesContext;
  /** Index into `ctx.candles` of the highest bar closed as of the current primary bar. */
  readIndex: () => number;
}

function getCached<T>(ctx: SeriesContext, key: string, compute: () => T): T {
  const existing = ctx.cache.get(key);
  if (existing !== undefined) {
    return existing as T;
  }

  const value = compute();
  ctx.cache.set(key, value);
  return value;
}

function readAt(series: IndicatorSeries, index: number): number | null {
  if (index < 0 || index >= series.length) {
    return null;
  }
  const value = series[index];
  return value === undefined ? null : value;
}

/**
 * Builds the accessor surface for one candle series (primary or a resampled
 * higher timeframe). `readIndex` resolves the bar to read *within this
 * series* — for the primary series that's the loop's current bar index; for
 * a higher timeframe it's that timeframe's cursor value for the current
 * primary bar. Every underlying indicator series is computed once (on first
 * access) over the *full* `ctx.candles` and cached — safe because every
 * indicator here is causal (value at k depends only on candles[0..k]), so
 * indexing into a full-series computation is identical to recomputing over
 * a truncated slice, just O(1) instead of O(n) per read.
 */
function createSeriesAccessors(
  ctx: SeriesContext,
  readIndex: () => number,
): IndicatorAccessors {
  const self: IndicatorAccessors = {
    sma(period = 20) {
      const series = getCached(ctx, `sma:${period}`, () =>
        calcSma(closes(ctx.candles), period),
      );
      return readAt(series, readIndex());
    },
    ema(period = 20) {
      const series = getCached(ctx, `ema:${period}`, () =>
        calcEma(closes(ctx.candles), period),
      );
      return readAt(series, readIndex());
    },
    rsi(period = 14) {
      const series = getCached(ctx, `rsi:${period}`, () =>
        calcRsi(closes(ctx.candles), period),
      );
      return readAt(series, readIndex());
    },
    macd(options = {}) {
      const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9 } = options;
      const key = `macd:${fastPeriod}:${slowPeriod}:${signalPeriod}`;
      const result = getCached(ctx, key, () =>
        calcMacd(closes(ctx.candles), { fastPeriod, slowPeriod, signalPeriod }),
      );
      const index = readIndex();
      return {
        macd: readAt(result.macdLine, index),
        signal: readAt(result.signalLine, index),
        hist: readAt(result.histogram, index),
      };
    },
    atr(period = 14) {
      const series = getCached(ctx, `atr:${period}`, () =>
        calcAtr(ctx.candles, period),
      );
      return readAt(series, readIndex());
    },
    adx(period = 14) {
      const result = getCached(ctx, `adx:${period}`, () =>
        calcAdx(ctx.candles, period),
      );
      return readAt(result.adx, readIndex());
    },
    bollinger(options = {}) {
      const { period = 20, standardDeviations = 2 } = options;
      const key = `bollinger:${period}:${standardDeviations}`;
      const result = getCached(ctx, key, () =>
        bollingerBands(closes(ctx.candles), { period, standardDeviations }),
      );
      const index = readIndex();
      return {
        upper: readAt(result.upper, index),
        middle: readAt(result.middle, index),
        lower: readAt(result.lower, index),
      };
    },
    stochastic(options = {}) {
      const { period = 14, signalPeriod = 3 } = options;
      const key = `stochastic:${period}:${signalPeriod}`;
      const result = getCached(ctx, key, () =>
        calcStochastic(ctx.candles, { period, signalPeriod }),
      );
      const index = readIndex();
      return { k: readAt(result.k, index), d: readAt(result.d, index) };
    },
    supertrend(options = {}) {
      const { period = 10, multiplier = 3 } = options;
      const key = `supertrend:${period}:${multiplier}`;
      const result = getCached(ctx, key, () =>
        calcSupertrend(ctx.candles, { period, multiplier }),
      );
      const index = readIndex();
      const direction =
        index >= 0 && index < result.direction.length
          ? result.direction[index]
          : null;
      return {
        value: readAt(result.trend, index),
        direction: direction ?? null,
      };
    },
    vwap() {
      const series = getCached(ctx, "vwap", () => calcVwap(ctx.candles));
      return readAt(series, readIndex());
    },
    // Overwritten by createIndicatorAccessors for the root object; a bare
    // series accessor (e.g. one returned by .timeframe()) doesn't nest further.
    timeframe() {
      throw new Error(
        "timeframe() is only available on the root indicator accessor",
      );
    },
    bias() {
      throw new Error(
        "bias() is only available on the root indicator accessor",
      );
    },
  };

  return self;
}

const MINUTES_TO_TIMEFRAME_KEY: Partial<Record<number, TimeframeKey>> =
  Object.fromEntries(
    Object.entries(TIMEFRAMES).map(([minutes, key]) => [Number(minutes), key]),
  );

function classificationFor(
  entry: TimeframeEntry,
  accessor: IndicatorAccessors,
): TimeframeIndicators {
  const index = entry.readIndex();
  return {
    rsi: accessor.rsi(),
    adx: accessor.adx(),
    atr: accessor.atr(),
    sma: accessor.sma(),
    ema: accessor.ema(),
    vwap: accessor.vwap(),
    macd: accessor.macd(),
    bollinger: accessor.bollinger(),
    stochastic: accessor.stochastic(),
    supertrend: accessor.supertrend(),
    lastClose: readAt(closes(entry.ctx.candles), index),
    candleCount: index + 1,
  };
}

/**
 * Builds the root indicator accessor for the primary series, wired to every
 * configured higher timeframe via `.timeframe(minutes)` and `.bias()`.
 */
export function createIndicatorAccessors(
  primaryCtx: SeriesContext,
  primaryReadIndex: () => number,
  htfEntries: TimeframeEntry[],
): IndicatorAccessors {
  const root = createSeriesAccessors(primaryCtx, primaryReadIndex);
  const htfAccessors = new Map<number, IndicatorAccessors>(
    htfEntries.map((entry) => [
      entry.minutes,
      createSeriesAccessors(entry.ctx, entry.readIndex),
    ]),
  );

  root.timeframe = (minutes: number) => {
    const accessor = htfAccessors.get(minutes);
    if (!accessor) {
      throw new Error(
        `Timeframe ${minutes}m was not configured in higherTimeframesMinutes`,
      );
    }
    return accessor;
  };

  root.bias = (): MultiTimeframeSummary => {
    const indicators: Partial<Record<TimeframeKey, TimeframeIndicators>> = {};

    for (const entry of htfEntries) {
      const key = MINUTES_TO_TIMEFRAME_KEY[entry.minutes];
      if (!key) {
        // Not one of the m1/m5/m15/m25/m60 keys analyzeMultiTimeframe blends —
        // still readable via .timeframe(minutes), just excluded from bias().
        continue;
      }

      const accessor = htfAccessors.get(entry.minutes);
      if (accessor) {
        indicators[key] = classificationFor(entry, accessor);
      }
    }

    return analyzeMultiTimeframe({ indicators } as Pick<
      TechnicalAnalysisResult,
      "indicators"
    >);
  };

  return root;
}
