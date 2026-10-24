import type { BacktestMetrics, ClosedTrade, EquityPoint } from "./types";

export function computeMetrics(
  trades: ClosedTrade[],
  equityCurve: EquityPoint[],
  initialCapital: number,
): BacktestMetrics {
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);

  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const profitFactor =
    grossLoss === 0
      ? grossProfit > 0
        ? Infinity
        : 0
      : grossProfit / grossLoss;

  return {
    totalTrades,
    winRate: totalTrades === 0 ? 0 : wins.length / totalTrades,
    totalPnl,
    maxDrawdown: computeMaxDrawdown(equityCurve, initialCapital),
    profitFactor,
    sharpe: computeSharpe(equityCurve),
  };
}

function computeMaxDrawdown(
  equityCurve: EquityPoint[],
  initialCapital: number,
): number {
  let peak = initialCapital;
  let maxDrawdown = 0;

  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    if (peak <= 0) {
      continue;
    }
    maxDrawdown = Math.max(maxDrawdown, (peak - point.equity) / peak);
  }

  return maxDrawdown;
}

/**
 * Per-bar Sharpe ratio scaled by `sqrt(n)` — not annualized, since the
 * harness has no notion of your bar interval's trading-days convention.
 */
function computeSharpe(equityCurve: EquityPoint[]): number | null {
  if (equityCurve.length < 2) {
    return null;
  }

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i += 1) {
    const previous = equityCurve[i - 1].equity;
    if (previous === 0) {
      continue;
    }
    returns.push((equityCurve[i].equity - previous) / previous);
  }

  if (returns.length < 2) {
    return null;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  return stdDev === 0 ? null : (mean / stdDev) * Math.sqrt(returns.length);
}
