import { EventEmitter } from "events";

import type { Candle } from "../ta/candles";
import type { MarketFeedEvent } from "../types/ws.types";

export interface CandleAggregatorOptions {
  /** Bar interval in minutes. Defaults to 1. */
  intervalMinutes?: number;
}

interface AggregatorState {
  candle: Candle;
  bucketStart: number;
  /** Cumulative day volume observed at the start of this bucket (from `full` packets). */
  baselineVolume: number;
}

function candleKey(exchangeSegment: string, securityId: string): string {
  return `${exchangeSegment}:${securityId}`;
}

/**
 * Builds OHLCV candles in real time from WS ticks (`ticker` and `full` packets).
 *
 * `full` packets carry Dhan's cumulative day volume rather than a per-print
 * delta, so each bucket tracks the cumulative value observed at its first
 * tick and reports `cumulative - baseline` as the bar's volume. A cumulative
 * reading below the current baseline (day rollover, feed restart) re-bases
 * rather than going negative.
 *
 * This class holds no timers — callers own bucket-interval choice and must
 * call `flush`/`flushAll` themselves (e.g. at session close) to emit the
 * final in-progress bar for a security.
 */
export class CandleAggregator extends EventEmitter {
  private readonly intervalSeconds: number;
  private readonly state = new Map<string, AggregatorState>();

  constructor(options: CandleAggregatorOptions = {}) {
    super();
    this.intervalSeconds = (options.intervalMinutes ?? 1) * 60;
  }

  /** Feed a parsed WS tick. No-ops for packet types without a price (OI, prev-close, disconnect). */
  public handleTick(event: MarketFeedEvent): void {
    if (event.type !== "ticker" && event.type !== "full") {
      return;
    }

    const key = candleKey(event.exchangeSegment, event.securityId);
    const bucketStart =
      Math.floor(event.ltt / this.intervalSeconds) * this.intervalSeconds;
    const cumulativeVolume = event.type === "full" ? event.volume : undefined;
    const existing = this.state.get(key);

    if (existing?.bucketStart !== bucketStart) {
      if (existing) {
        this.emit("close", key, existing.candle);
      }

      const next: AggregatorState = {
        bucketStart,
        baselineVolume: cumulativeVolume ?? 0,
        candle: {
          timestamp: bucketStart,
          open: event.ltp,
          high: event.ltp,
          low: event.ltp,
          close: event.ltp,
          volume: 0,
          openInterest: event.type === "full" ? event.openInterest : undefined,
        },
      };
      this.state.set(key, next);
      this.emit("update", key, next.candle);
      return;
    }

    existing.candle.high = Math.max(existing.candle.high, event.ltp);
    existing.candle.low = Math.min(existing.candle.low, event.ltp);
    existing.candle.close = event.ltp;

    if (event.type === "full" && cumulativeVolume !== undefined) {
      if (cumulativeVolume < existing.baselineVolume) {
        existing.baselineVolume = cumulativeVolume;
      }
      existing.candle.volume = cumulativeVolume - existing.baselineVolume;
      existing.candle.openInterest = event.openInterest;
    }

    this.emit("update", key, existing.candle);
  }

  /** Primes a bucket with a known candle, e.g. the latest bar from `candlesFromSeries` on connect. */
  public seed(
    exchangeSegment: string,
    securityId: string,
    candle: Candle,
    baselineVolume = 0,
  ): void {
    this.state.set(candleKey(exchangeSegment, securityId), {
      candle: { ...candle },
      bucketStart: candle.timestamp,
      baselineVolume,
    });
  }

  /** Current (possibly in-progress) candle for a security. */
  public getCandle(
    exchangeSegment: string,
    securityId: string,
  ): Candle | undefined {
    return this.state.get(candleKey(exchangeSegment, securityId))?.candle;
  }

  /** Closes and removes the in-progress candle for one security, emitting `close`. */
  public flush(exchangeSegment: string, securityId: string): void {
    const key = candleKey(exchangeSegment, securityId);
    const existing = this.state.get(key);
    if (existing) {
      this.emit("close", key, existing.candle);
      this.state.delete(key);
    }
  }

  /** Closes and removes every in-progress candle, emitting `close` for each. */
  public flushAll(): void {
    for (const [key, existing] of this.state) {
      this.emit("close", key, existing.candle);
    }
    this.state.clear();
  }

  public clear(): void {
    this.state.clear();
  }
}
