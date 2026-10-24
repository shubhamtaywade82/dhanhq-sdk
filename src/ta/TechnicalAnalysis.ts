import { MARKET_HOURS } from "../constants";
import type { Charts } from "../resources/Charts";
import { candlesFromSeries, closes, resample, type Candle } from "./candles";
import {
  adx,
  atr,
  bollingerBands,
  ema,
  latest,
  macd,
  rsi,
  sma,
  stochastic,
  supertrend,
  vwap,
  type IndicatorSeries,
} from "./indicators";
import {
  isTradingDay,
  lastTradingDay,
  todayOrLastTradingDay,
  tradingDaysAgo,
} from "./marketCalendar";

/** Minute intervals the charts API serves, and the keys they map to. */
export const TIMEFRAMES = {
  1: "m1",
  5: "m5",
  15: "m15",
  25: "m25",
  60: "m60",
} as const;

export type TimeframeKey = (typeof TIMEFRAMES)[keyof typeof TIMEFRAMES];

export interface TechnicalAnalysisOptions {
  rsiPeriod?: number;
  atrPeriod?: number;
  adxPeriod?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  smaPeriod?: number;
  emaPeriod?: number;
  bollingerPeriod?: number;
  /** Pause between per-interval chart requests, in ms. Defaults to 1000. */
  throttleMs?: number;
}

export interface ComputeRequest {
  securityId: string;
  exchangeSegment: string;
  instrument: string;
  fromDate?: string;
  toDate?: string;
  /** Trading days of history to pull. Derived from indicator periods if omitted. */
  daysBack?: number;
  intervals?: number[];
  oi?: boolean;
}

export interface TimeframeIndicators {
  rsi: number | null;
  adx: number | null;
  atr: number | null;
  sma: number | null;
  ema: number | null;
  vwap: number | null;
  macd: { macd: number | null; signal: number | null; hist: number | null };
  bollinger: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
  };
  stochastic: { k: number | null; d: number | null };
  supertrend: { value: number | null; direction: 1 | -1 | null };
  lastClose: number | null;
  candleCount: number;
}

export interface TechnicalAnalysisResult {
  meta: {
    securityId: string;
    exchangeSegment: string;
    instrument: string;
    fromDate: string;
    toDate: string;
  };
  indicators: Partial<Record<TimeframeKey, TimeframeIndicators>>;
}

const DEFAULTS: Required<Omit<TechnicalAnalysisOptions, never>> = {
  rsiPeriod: 14,
  atrPeriod: 14,
  adxPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  smaPeriod: 20,
  emaPeriod: 20,
  bollingerPeriod: 20,
  throttleMs: 1000,
};

/**
 * Multi-timeframe indicator computation over the charts API.
 *
 * Pulls intraday candles per interval, then reduces each timeframe to the
 * latest value of every indicator — the shape {@link analyzeMultiTimeframe}
 * consumes.
 */
export class TechnicalAnalysis {
  private readonly options: Required<TechnicalAnalysisOptions>;

  constructor(
    private readonly charts: Charts,
    options: TechnicalAnalysisOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Fetches candles per interval and computes indicators for each. */
  public async compute(
    request: ComputeRequest,
  ): Promise<TechnicalAnalysisResult> {
    const intervals = request.intervals ?? [1, 5, 15, 25, 60];
    const toDate = this.normalizeToDate(request.toDate);
    const daysBack =
      request.daysBack && request.daysBack > 0
        ? request.daysBack
        : this.autoDaysNeeded(intervals);
    const fromDate = this.normalizeFromDate(request.fromDate, toDate, daysBack);

    const indicators: Partial<Record<TimeframeKey, TimeframeIndicators>> = {};

    for (const [index, interval] of intervals.entries()) {
      const key = TIMEFRAMES[interval as keyof typeof TIMEFRAMES];
      if (!key) {
        continue;
      }

      const response = await this.charts.intraday({
        securityId: request.securityId,
        exchangeSegment: request.exchangeSegment as never,
        instrument: request.instrument as never,
        interval: String(interval) as never,
        oi: request.oi,
        fromDate,
        toDate,
      });

      indicators[key] = this.computeFor(candlesFromSeries(response));

      // The charts endpoint sits on the 5/sec data tier; spacing the calls
      // keeps a five-interval sweep clear of the limit.
      if (index < intervals.length - 1) {
        await sleep(this.options.throttleMs);
      }
    }

    return {
      meta: {
        securityId: request.securityId,
        exchangeSegment: request.exchangeSegment,
        instrument: request.instrument,
        fromDate,
        toDate,
      },
      indicators,
    };
  }

  /**
   * Computes the same multi-timeframe result from a single base series by
   * resampling, so one API call can cover every interval.
   */
  public computeFromCandles(
    baseCandles: Candle[],
    intervals: number[] = [1, 5, 15, 25, 60],
  ): Partial<Record<TimeframeKey, TimeframeIndicators>> {
    const indicators: Partial<Record<TimeframeKey, TimeframeIndicators>> = {};

    for (const interval of intervals) {
      const key = TIMEFRAMES[interval as keyof typeof TIMEFRAMES];
      if (!key) {
        continue;
      }

      indicators[key] = this.computeFor(resample(baseCandles, interval));
    }

    return indicators;
  }

  /** Every indicator for one timeframe, reduced to its latest value. */
  public computeFor(candles: Candle[]): TimeframeIndicators {
    if (candles.length === 0) {
      return emptyIndicators();
    }

    const closeSeries = closes(candles);
    const macdResult = macd(closeSeries, {
      fastPeriod: this.options.macdFast,
      slowPeriod: this.options.macdSlow,
      signalPeriod: this.options.macdSignal,
    });
    const bands = bollingerBands(closeSeries, {
      period: this.options.bollingerPeriod,
    });
    const stoch = stochastic(candles);
    const trend = supertrend(candles);

    return {
      rsi: latest(rsi(closeSeries, this.options.rsiPeriod)),
      adx: latest(adx(candles, this.options.adxPeriod).adx),
      atr: latest(atr(candles, this.options.atrPeriod)),
      sma: latest(sma(closeSeries, this.options.smaPeriod)),
      ema: latest(ema(closeSeries, this.options.emaPeriod)),
      vwap: latest(vwap(candles)),
      macd: {
        macd: latest(macdResult.macdLine),
        signal: latest(macdResult.signalLine),
        hist: latest(macdResult.histogram),
      },
      bollinger: {
        upper: latest(bands.upper),
        middle: latest(bands.middle),
        lower: latest(bands.lower),
      },
      stochastic: { k: latest(stoch.k), d: latest(stoch.d) },
      supertrend: {
        value: latest(trend.trend),
        direction: lastDirection(trend.direction),
      },
      lastClose: closeSeries[closeSeries.length - 1] ?? null,
      candleCount: candles.length,
    };
  }

  /** Bars needed before the slowest configured indicator produces a value. */
  private requiredBars(): number {
    return Math.max(
      this.options.rsiPeriod + 1,
      this.options.atrPeriod + 1,
      this.options.adxPeriod * 2,
      this.options.macdSlow,
      this.options.bollingerPeriod,
    );
  }

  private autoDaysNeeded(intervals: number[]): number {
    const needed = this.requiredBars();

    return Math.max(
      ...intervals.map((interval) => {
        const barsPerDay = Math.max(
          Math.floor(MARKET_HOURS.sessionMinutes / Math.max(interval, 1)),
          1,
        );
        return Math.ceil(needed / barsPerDay);
      }),
      1,
    );
  }

  private normalizeToDate(toDate?: string): string {
    if (!toDate) {
      return todayOrLastTradingDay();
    }

    return isTradingDay(toDate) ? toDate : lastTradingDay(toDate);
  }

  private normalizeFromDate(
    fromDate: string | undefined,
    toDate: string,
    daysBack: number,
  ): string {
    if (fromDate) {
      return isTradingDay(fromDate) ? fromDate : lastTradingDay(fromDate);
    }

    // `toDate` is exclusive on the charts endpoint, so N trading days back from
    // it is what actually yields N sessions of data.
    return tradingDaysAgo(toDate, daysBack);
  }
}

function lastDirection(directions: Array<1 | -1 | null>): 1 | -1 | null {
  for (let index = directions.length - 1; index >= 0; index -= 1) {
    const value = directions[index];
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function emptyIndicators(): TimeframeIndicators {
  const empty: IndicatorSeries = [];
  void empty;

  return {
    rsi: null,
    adx: null,
    atr: null,
    sma: null,
    ema: null,
    vwap: null,
    macd: { macd: null, signal: null, hist: null },
    bollinger: { upper: null, middle: null, lower: null },
    stochastic: { k: null, d: null },
    supertrend: { value: null, direction: null },
    lastClose: null,
    candleCount: 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
