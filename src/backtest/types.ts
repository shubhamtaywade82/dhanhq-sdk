import type { Pipeline } from "../risk/Pipeline";
import type { Candle } from "../ta/candles";
import type { MultiTimeframeSummary } from "../ta/multiTimeframe";

export type Side = "LONG" | "SHORT";

/** Which way money moves on this specific fill — the entry of a SHORT and the exit of a LONG are both sells. */
export type FillDirection = "buy" | "sell";

export interface EntrySignal {
  side: Side;
  /** Required — every backtested trade is risk-defined, matching `requireOptionsStops`. */
  stopLoss: number;
  target?: number;
  /** Explicit share/lot count. Takes priority over `riskPercent` if both are set. */
  quantity?: number;
  /** Sized via `fixedRiskSize()` against running (realized) capital when `quantity` is omitted. */
  riskPercent?: number;
  reason?: string;
}

export type StrategySignal =
  | { type: "enter"; signal: EntrySignal }
  | { type: "exit"; reason: string }
  | { type: "hold" };

export interface OpenPosition {
  side: Side;
  entryPrice: number;
  quantity: number;
  entryIndex: number;
  stopLoss: number;
  target?: number;
  /** Entry-leg fee, carried until the position closes so `ClosedTrade.fees` can report the round trip. */
  entryFee: number;
}

export type BacktestExitReason =
  "stop_loss" | "target" | "signal" | "end_of_data";

export interface ClosedTrade extends OpenPosition {
  exitPrice: number;
  exitIndex: number;
  exitReason: BacktestExitReason;
  /** Gross P&L minus `fees`. */
  pnl: number;
  /** Entry-leg + exit-leg fees combined. */
  fees: number;
}

export type SkipReason =
  | "risk_violation"
  | "no_fill_window"
  | "position_open"
  | "invalid_signal"
  | "zero_quantity";

export interface SkippedSignal {
  /** The bar index the strategy made this decision on, not the (missed) fill bar. */
  index: number;
  reason: SkipReason;
  detail?: string;
}

export interface EquityPoint {
  index: number;
  timestamp: number;
  equity: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  /** Largest peak-to-trough drawdown on the equity curve, as a fraction (`0.1` = 10%). */
  maxDrawdown: number;
  /** `grossProfit / grossLoss`. `Infinity` when there were wins and no losses, `0` when there were no trades at all. */
  profitFactor: number;
  /**
   * Per-bar Sharpe ratio scaled by `sqrt(n)`, not annualized to any specific
   * trading-days convention — the harness doesn't know your bar interval's
   * business meaning. `null` when there isn't enough equity-curve variance
   * to compute one.
   */
  sharpe: number | null;
}

export interface BacktestResult {
  trades: ClosedTrade[];
  skippedSignals: SkippedSignal[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
}

export interface IndicatorAccessors {
  sma(period?: number): number | null;
  ema(period?: number): number | null;
  rsi(period?: number): number | null;
  macd(options?: {
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
  }): { macd: number | null; signal: number | null; hist: number | null };
  atr(period?: number): number | null;
  adx(period?: number): number | null;
  bollinger(options?: { period?: number; standardDeviations?: number }): {
    upper: number | null;
    middle: number | null;
    lower: number | null;
  };
  stochastic(options?: { period?: number; signalPeriod?: number }): {
    k: number | null;
    d: number | null;
  };
  supertrend(options?: { period?: number; multiplier?: number }): {
    value: number | null;
    direction: 1 | -1 | null;
  };
  vwap(): number | null;
  /**
   * Same accessors, scoped to one of `higherTimeframesMinutes`, read at the
   * highest bar that had fully closed as of the current primary bar — never
   * a bar still in progress. Throws if `minutes` wasn't configured.
   */
  timeframe(minutes: number): IndicatorAccessors;
  /**
   * `analyzeMultiTimeframe()` bias as of this bar, blended over whichever of
   * `higherTimeframesMinutes` map onto `m1`/`m5`/`m15`/`m25`/`m60` — other
   * resample minutes are visible via `.timeframe(m)` but not this blend.
   */
  bias(): MultiTimeframeSummary;
}

export interface StrategyContext {
  index: number;
  /** `candles[0..index]` — the closed bar the strategy is reacting to, and nothing after it. */
  candles: Candle[];
  /** `undefined` when flat. */
  position?: OpenPosition;
  indicators: IndicatorAccessors;
}

export type Strategy = (context: StrategyContext) => StrategySignal;

export interface CostModel {
  /** Returns the adjusted fill price (not a delta) for a fill going `direction`. */
  slippage?(
    rawPrice: number,
    direction: FillDirection,
    quantity: number,
  ): number;
  /** Charged on both the entry and the exit leg; summed into `ClosedTrade.fees`. */
  fees?(fillPrice: number, quantity: number): number;
}

export interface BacktestConfig {
  /** Base-resolution series; the engine iterates bar-by-bar over this. */
  candles: Candle[];
  /** Additional resolutions in minutes, resampled from `candles` once upfront (e.g. `[15, 60]`). */
  higherTimeframesMinutes?: number[];
  initialCapital: number;
  /** Quantities round down to a whole multiple of this. Defaults to 1. */
  lotSize?: number;
  /**
   * Gates every entry signal through `pipeline.report()`. Note this pipeline
   * has no idea it's running inside a simulation — position/concentration/
   * daily-loss checks only mean something if you supply a `RiskDataProvider`
   * that reflects the backtest's own simulated state, not your live account.
   * `market_hours` also runs against `candles`' own timestamps, so a
   * daily/EOD series will get every signal rejected unless you pass a
   * `checks` list that drops it.
   */
  riskPipeline?: Pipeline;
  costModel?: CostModel;
  strategy: Strategy;
}
