import { resample } from "../ta/candles";
import type { Candle } from "../ta/candles";
import { fixedRiskSize } from "../risk/positionSizing";
import type { RiskOrderArgs } from "../risk/types";
import { buildCursor } from "./cursors";
import {
  createIndicatorAccessors,
  type SeriesContext,
  type TimeframeEntry,
} from "./indicators";
import { computeMetrics } from "./metrics";
import type {
  BacktestConfig,
  BacktestResult,
  ClosedTrade,
  CostModel,
  EntrySignal,
  EquityPoint,
  BacktestExitReason,
  FillDirection,
  OpenPosition,
  SkipReason,
  SkippedSignal,
  StrategyContext,
  StrategySignal,
} from "./types";

type PendingAction =
  | { type: "enter"; signal: EntrySignal; decidedAt: number }
  | { type: "exit"; decidedAt: number };

/**
 * Bar-by-bar strategy backtester. Decides on a closed bar, fills at the next
 * bar's open, checks stops/targets intrabar, and marks equity at each bar's
 * close. See `src/backtest/types.ts` for the full contract.
 */
export class Backtester {
  public async run(config: BacktestConfig): Promise<BacktestResult> {
    const { candles, strategy, riskPipeline, costModel } = config;
    const lotSize = config.lotSize ?? 1;
    const initialCapital = config.initialCapital;

    const trades: ClosedTrade[] = [];
    const skippedSignals: SkippedSignal[] = [];
    const equityCurve: EquityPoint[] = [];

    if (candles.length === 0) {
      return {
        trades,
        skippedSignals,
        equityCurve,
        metrics: computeMetrics([], [], initialCapital),
      };
    }

    // --- Precompute phase: O(n) total, once, before the simulation loop. ---
    const primaryCtx: SeriesContext = { candles, cache: new Map() };
    const box = { i: 0 };

    const htfEntries: TimeframeEntry[] = (
      config.higherTimeframesMinutes ?? []
    ).map((minutes) => {
      const series = resample(candles, minutes);
      const cursor = buildCursor(candles, series, minutes * 60);
      const ctx: SeriesContext = { candles: series, cache: new Map() };
      return { minutes, ctx, readIndex: () => cursor[box.i] };
    });

    const indicators = createIndicatorAccessors(
      primaryCtx,
      () => box.i,
      htfEntries,
    );

    // --- Simulation state. ---
    let cash = initialCapital;
    let position: OpenPosition | undefined;
    let pending: PendingAction | undefined;

    for (let i = 0; i < candles.length; i += 1) {
      box.i = i;
      const bar = candles[i];

      // Phase A — execute the fill scheduled from the previous bar's decision,
      // at *this* bar's open.
      if (pending) {
        if (pending.type === "enter") {
          if (position) {
            skippedSignals.push({
              index: pending.decidedAt,
              reason: "position_open",
            });
          } else {
            const outcome = await this.tryOpen(
              pending.signal,
              bar,
              i,
              cash,
              lotSize,
              costModel,
              riskPipeline,
            );
            if ("error" in outcome) {
              skippedSignals.push({
                index: pending.decidedAt,
                reason: outcome.error,
                detail: outcome.detail,
              });
            } else {
              position = outcome.position;
            }
          }
        } else if (position) {
          const trade = closeTrade(position, bar.open, i, "signal", costModel);
          trades.push(trade);
          cash += trade.pnl;
          position = undefined;
        }
        pending = undefined;
      }

      // Phase B — intrabar stop/target check, covers a position just opened
      // in Phase A too (it's live for the remainder of this bar).
      if (position) {
        const hit = checkStopTarget(position, bar);
        if (hit) {
          const trade = closeTrade(
            position,
            hit.price,
            i,
            hit.reason,
            costModel,
          );
          trades.push(trade);
          cash += trade.pnl;
          position = undefined;
        }
      }

      // Phase C — mark-to-market at this bar's close.
      equityCurve.push({
        index: i,
        timestamp: bar.timestamp,
        equity: cash + unrealized(position, bar.close),
      });

      // Phase D — ask the strategy, using only the bar that just closed.
      const context: StrategyContext = {
        index: i,
        candles: candles.slice(0, i + 1),
        position,
        indicators,
      };
      const decision: StrategySignal = strategy(context);

      // Phase E — schedule the decision for the next bar's open.
      if (decision.type === "enter" || decision.type === "exit") {
        if (i + 1 >= candles.length) {
          skippedSignals.push({ index: i, reason: "no_fill_window" });
        } else if (decision.type === "enter") {
          pending = { type: "enter", signal: decision.signal, decidedAt: i };
        } else {
          pending = { type: "exit", decidedAt: i };
        }
      }
    }

    // A position still open when data runs out is force-closed at the last close.
    if (position) {
      const lastIndex = candles.length - 1;
      trades.push(
        closeTrade(
          position,
          candles[lastIndex].close,
          lastIndex,
          "end_of_data",
          costModel,
        ),
      );
    }

    return {
      trades,
      skippedSignals,
      equityCurve,
      metrics: computeMetrics(trades, equityCurve, initialCapital),
    };
  }

  private async tryOpen(
    signal: EntrySignal,
    fillBar: Candle,
    fillIndex: number,
    cash: number,
    lotSize: number,
    costModel: CostModel | undefined,
    riskPipeline: BacktestConfig["riskPipeline"],
  ): Promise<
    { position: OpenPosition } | { error: SkipReason; detail?: string }
  > {
    let quantity: number;
    if (signal.quantity !== undefined) {
      quantity = Math.floor(signal.quantity / lotSize) * lotSize;
    } else if (signal.riskPercent !== undefined) {
      quantity = fixedRiskSize({
        accountBalance: cash,
        riskPercent: signal.riskPercent,
        entryPrice: fillBar.open,
        stopLossPrice: signal.stopLoss,
        lotSize,
      });
    } else {
      return {
        error: "invalid_signal",
        detail: "signal must set quantity or riskPercent",
      };
    }

    if (quantity <= 0) {
      return { error: "zero_quantity" };
    }

    if (riskPipeline) {
      const args: RiskOrderArgs = {
        transactionType: signal.side === "LONG" ? "BUY" : "SELL",
        quantity,
        price: fillBar.open,
        stopLoss: signal.stopLoss,
        target: signal.target,
      };
      const report = await riskPipeline.report({
        args,
        now: new Date(fillBar.timestamp * 1000),
      });
      if (!report.passed) {
        return {
          error: "risk_violation",
          detail: report.violations
            .map((v) => `${v.check}: ${v.message}`)
            .join("; "),
        };
      }
    }

    const direction: FillDirection = signal.side === "LONG" ? "buy" : "sell";
    const entryPrice = costModel?.slippage
      ? costModel.slippage(fillBar.open, direction, quantity)
      : fillBar.open;
    const entryFee = costModel?.fees ? costModel.fees(entryPrice, quantity) : 0;

    return {
      position: {
        side: signal.side,
        entryPrice,
        quantity,
        entryIndex: fillIndex,
        stopLoss: signal.stopLoss,
        target: signal.target,
        entryFee,
      },
    };
  }
}

function unrealized(
  position: OpenPosition | undefined,
  markPrice: number,
): number {
  if (!position) {
    return 0;
  }
  const direction = position.side === "LONG" ? 1 : -1;
  return (markPrice - position.entryPrice) * direction * position.quantity;
}

/**
 * Stop checked before target when a single bar's range could have hit both —
 * the conservative, standard convention when only OHLC (not intrabar path)
 * is available.
 */
function checkStopTarget(
  position: OpenPosition,
  bar: Candle,
): { price: number; reason: "stop_loss" | "target" } | undefined {
  if (position.side === "LONG") {
    if (bar.low <= position.stopLoss) {
      return { price: position.stopLoss, reason: "stop_loss" };
    }
    if (position.target !== undefined && bar.high >= position.target) {
      return { price: position.target, reason: "target" };
    }
  } else {
    if (bar.high >= position.stopLoss) {
      return { price: position.stopLoss, reason: "stop_loss" };
    }
    if (position.target !== undefined && bar.low <= position.target) {
      return { price: position.target, reason: "target" };
    }
  }
  return undefined;
}

function closeTrade(
  position: OpenPosition,
  rawExitPrice: number,
  exitIndex: number,
  exitReason: BacktestExitReason,
  costModel: CostModel | undefined,
): ClosedTrade {
  const direction: FillDirection = position.side === "LONG" ? "sell" : "buy";
  const exitPrice = costModel?.slippage
    ? costModel.slippage(rawExitPrice, direction, position.quantity)
    : rawExitPrice;
  const exitFee = costModel?.fees
    ? costModel.fees(exitPrice, position.quantity)
    : 0;
  const fees = position.entryFee + exitFee;

  const sideMultiplier = position.side === "LONG" ? 1 : -1;
  const gross =
    (exitPrice - position.entryPrice) * sideMultiplier * position.quantity;

  return {
    ...position,
    exitPrice,
    exitIndex,
    exitReason,
    pnl: gross - fees,
    fees,
  };
}
