import type { MultiTimeframeSummary } from "../ta/multiTimeframe";

/**
 * Prompt construction for AI trading assistants.
 *
 * These render account and market state into text an LLM can reason over —
 * they never call the API themselves, so a caller decides what data to fetch
 * and how fresh it needs to be.
 */

export interface HoldingLike {
  tradingSymbol?: string;
  securityId?: string;
  totalQty?: number;
  avgCostPrice?: number;
  [key: string]: unknown;
}

export interface PositionLike {
  tradingSymbol?: string;
  securityId?: string;
  netQty?: number;
  buyAvg?: number;
  costPrice?: number;
  unrealizedProfit?: number;
  realizedProfit?: number;
  productType?: string;
  [key: string]: unknown;
}

export interface FundsLike {
  availabelBalance?: number;
  availableBalance?: number;
  utilizedAmount?: number;
  withdrawableBalance?: number;
  [key: string]: unknown;
}

/** System prompt establishing the assistant's remit and guardrails. */
export function systemPrompt(capabilities: string[] = []): string {
  const extra =
    capabilities.length === 0
      ? ""
      : `\nAdditional capabilities:\n${capabilities.map((entry) => `- ${entry}`).join("\n")}\n`;

  return `You are an AI trading assistant for Indian stock markets (NSE, BSE, MCX).

Your capabilities:
- Fetch market data (LTP, OHLC, quotes, option chains)
- Place, modify, and cancel orders
- View portfolio holdings, positions, and orders
- Calculate option Greeks and implied volatility
- Analyze option chains, max pain and put-call ratios
- Compute multi-timeframe technical indicators
- Apply risk management rules
${extra}
Rules:
- Always confirm before placing live orders
- Use correlationId for all agent-originated orders
- Never expose access tokens or secrets
- Prefer read-only operations unless explicitly asked to trade
- Validate instruments with a search before trading them`;
}

/** Human-readable portfolio state: funds, holdings and open positions. */
export function portfolioSummary(input: {
  holdings?: HoldingLike[];
  positions?: PositionLike[];
  funds?: FundsLike;
}): string {
  const holdings = input.holdings ?? [];
  const positions = input.positions ?? [];
  const open = positions.filter(
    (position) => Number(position.netQty ?? 0) !== 0,
  );

  const lines = ["=== Portfolio Summary ==="];

  if (input.funds) {
    lines.push(`Funds: ${describeFunds(input.funds)}`);
  }

  lines.push("", `Holdings (${holdings.length}):`);
  for (const holding of holdings) {
    lines.push(`  ${describeHolding(holding)}`);
  }

  lines.push("", `Open Positions (${open.length}):`);
  for (const position of open) {
    lines.push(`  ${describePosition(position)}`);
  }

  return lines.join("\n");
}

/**
 * Risk exposure across positions.
 *
 * P&L is summed over every position, but the count is restricted to open
 * ones — a closed position still contributed realized P&L today.
 */
export function riskReport(input: {
  positions?: PositionLike[];
  maxDrawdownPct?: number;
  dailyLossLimit?: number;
}): string {
  const positions = input.positions ?? [];

  const unrealized = positions.reduce(
    (total, position) => total + Number(position.unrealizedProfit ?? 0),
    0,
  );
  const realized = positions.reduce(
    (total, position) => total + Number(position.realizedProfit ?? 0),
    0,
  );
  const open = positions.filter(
    (position) => Number(position.netQty ?? 0) !== 0,
  ).length;

  const lines = [
    "=== Risk Report ===",
    `Total Unrealized P&L: ₹${unrealized.toFixed(2)}`,
    `Total Realized P&L: ₹${realized.toFixed(2)}`,
    `Open Positions: ${open}`,
  ];

  if (input.maxDrawdownPct !== undefined) {
    lines.push(`Max Drawdown: ${input.maxDrawdownPct}%`);
  }

  if (input.dailyLossLimit !== undefined) {
    lines.push(`Daily Loss Limit: ₹${input.dailyLossLimit}`);
  }

  return lines.join("\n");
}

/** Renders a multi-timeframe bias into prose. */
export function marketAnalysis(summary: MultiTimeframeSummary): string {
  const { bias, setup, confidence, rationale, trendStrength } = summary.summary;

  return [
    "=== Market Analysis ===",
    `Bias: ${bias} (confidence ${confidence})`,
    `Suggested setup: ${setup}`,
    `Trend strength: ${trendStrength}`,
    `RSI: ${rationale.rsi}`,
    `MACD: ${rationale.macd}`,
    `ADX: ${rationale.adx}`,
    `ATR: ${rationale.atr}`,
  ].join("\n");
}

/** Confirmation text to show a human before a live order goes out. */
export function orderConfirmation(order: Record<string, unknown>): string {
  const lines = [
    "=== Order Confirmation Required ===",
    `${order.transactionType} ${order.quantity}x ${order.securityId}`,
    `Exchange: ${order.exchangeSegment}`,
    `Product: ${order.productType}`,
    `Type: ${order.orderType}`,
    order.price === undefined ? "Market Price" : `Price: ₹${order.price}`,
  ];

  if (order.triggerPrice !== undefined) {
    lines.push(`Trigger: ₹${order.triggerPrice}`);
  }

  lines.push("", "Please confirm this order.");
  return lines.join("\n");
}

function describeFunds(funds: FundsLike): string {
  const available = funds.availabelBalance ?? funds.availableBalance ?? 0;

  return (
    `available ₹${Number(available).toFixed(2)}, ` +
    `utilized ₹${Number(funds.utilizedAmount ?? 0).toFixed(2)}, ` +
    `withdrawable ₹${Number(funds.withdrawableBalance ?? 0).toFixed(2)}`
  );
}

function describeHolding(holding: HoldingLike): string {
  const symbol = holding.tradingSymbol ?? holding.securityId ?? "unknown";
  return `${symbol}: ${holding.totalQty ?? 0} @ ₹${Number(holding.avgCostPrice ?? 0).toFixed(2)}`;
}

function describePosition(position: PositionLike): string {
  const symbol = position.tradingSymbol ?? position.securityId ?? "unknown";
  const cost = position.buyAvg ?? position.costPrice ?? 0;

  return (
    `${symbol} (${position.productType ?? "—"}): ${position.netQty ?? 0} @ ₹${Number(cost).toFixed(2)}, ` +
    `unrealized ₹${Number(position.unrealizedProfit ?? 0).toFixed(2)}`
  );
}
