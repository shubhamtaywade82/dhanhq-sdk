import type { TransactionType } from "../types/order.types";
import type { MarketFeedEvent } from "../types/ws.types";

export interface Fill {
  exchangeSegment: string;
  securityId: string;
  transactionType: TransactionType;
  /** Always positive — direction comes from `transactionType`. */
  quantity: number;
  price: number;
  timestamp: Date;
  orderId?: string;
  correlationId?: string;
}

export interface LedgerPosition {
  exchangeSegment: string;
  securityId: string;
  /** Positive for a net long, negative for a net short, `0` when flat. */
  netQuantity: number;
  /** Volume-weighted cost basis of the currently open quantity. `0` when flat. */
  averagePrice: number;
  /** Cumulative — survives the position going flat, unlike `netQuantity`/`averagePrice`. */
  realizedPnl: number;
  fills: Fill[];
}

export interface PositionExposure {
  exchangeSegment: string;
  securityId: string;
  netQuantity: number;
  /** Last tick price if `onTick()` has seen one for this symbol, else `averagePrice`. */
  markPrice: number;
  exposure: number;
  unrealizedPnl: number;
}

/**
 * Folds one fill into a position's running average-cost state.
 *
 * Pure and side-effect-free so every add/reduce/close/flip case is directly
 * testable without a `PositionLedger` instance.
 */
export function applyFill(
  existing: LedgerPosition | undefined,
  fill: Fill,
): LedgerPosition {
  const base: LedgerPosition = existing ?? {
    exchangeSegment: fill.exchangeSegment,
    securityId: fill.securityId,
    netQuantity: 0,
    averagePrice: 0,
    realizedPnl: 0,
    fills: [],
  };

  const delta = fill.transactionType === "BUY" ? fill.quantity : -fill.quantity;
  const sameDirection =
    base.netQuantity === 0 || Math.sign(base.netQuantity) === Math.sign(delta);

  let netQuantity = base.netQuantity;
  let averagePrice = base.averagePrice;
  let realizedPnl = base.realizedPnl;

  if (sameDirection) {
    // Opening or extending a position: fold into the weighted-average cost basis.
    averagePrice =
      netQuantity === 0
        ? fill.price
        : (Math.abs(netQuantity) * averagePrice + fill.quantity * fill.price) /
          (Math.abs(netQuantity) + fill.quantity);
    netQuantity += delta;
  } else {
    // Reducing, closing, or flipping through flat.
    const closingQty = Math.min(Math.abs(delta), Math.abs(netQuantity));
    const closingSide = Math.sign(netQuantity);
    realizedPnl += (fill.price - averagePrice) * closingQty * closingSide;

    const remainder = Math.abs(delta) - closingQty;
    netQuantity += delta;

    if (remainder > 0) {
      // The fill outsized the open position — the leftover opens a new one
      // in the other direction, priced at this fill.
      averagePrice = fill.price;
    } else if (netQuantity === 0) {
      averagePrice = 0;
    }
    // Otherwise still open in the same direction with quantity left — the
    // cost basis of what remains open doesn't change on a partial reduce.
  }

  return {
    ...base,
    netQuantity,
    averagePrice,
    realizedPnl,
    fills: [...base.fills, fill],
  };
}

function keyFor(exchangeSegment: string, securityId: string): string {
  return `${exchangeSegment}:${securityId}`;
}

/**
 * Derives positions, fill history, realized P&L, and exposure from fills —
 * the state layer `PositionMonitor` sits on top of. `PositionMonitor`
 * decides when to exit a position it's told about; `PositionLedger` figures
 * out what's actually open from what has actually filled.
 *
 * This does not listen to the order-update WebSocket itself — Dhan's raw
 * payload only exposes `orderId`/`status`/`tradedQty`/`averageTradedPrice`/
 * `securityId` in typed form (see `OrderState`), not the `exchangeSegment` or
 * `transactionType` a ledger needs, and `tradedQty` is *cumulative* for the
 * order, not a per-event delta. Feed it explicitly instead, once per order,
 * from the side that already knows those fields — typically an
 * `OrderTracker` `filled` handler, since your own place-order request
 * already carried `exchangeSegment`/`transactionType`:
 *
 * ```ts
 * tracker.on("filled", (outcome) => {
 *   ledger.recordFill({
 *     exchangeSegment: request.exchangeSegment,
 *     securityId: request.securityId,
 *     transactionType: request.transactionType,
 *     quantity: outcome.filledQuantity,
 *     price: outcome.averagePrice!,
 *     timestamp: new Date(),
 *     orderId: outcome.orderId,
 *     correlationId: outcome.correlationId,
 *   });
 * });
 * ```
 *
 * If you want per-partial-fill granularity from `partial` events instead of
 * one fill per order, diff each event's `filledQuantity` against the
 * previous value yourself first — calling `recordFill()` with the raw
 * cumulative quantity on every partial event double-counts.
 *
 * No persistence: state lives in memory and resets on restart or `reset()`.
 */
export class PositionLedger {
  private readonly positions = new Map<string, LedgerPosition>();
  private readonly markPrices = new Map<string, number>();
  private readonly history: Fill[] = [];

  public recordFill(fill: Fill): LedgerPosition {
    const key = keyFor(fill.exchangeSegment, fill.securityId);
    const updated = applyFill(this.positions.get(key), fill);
    this.positions.set(key, updated);
    this.history.push(fill);
    return updated;
  }

  /** Feeds one market tick in. Wire to `client.ws.market.on("tick", …)`. */
  public onTick(event: MarketFeedEvent): void {
    const ltp = "ltp" in event ? event.ltp : undefined;
    if (typeof ltp !== "number" || !Number.isFinite(ltp)) {
      return;
    }
    this.markPrices.set(keyFor(event.exchangeSegment, event.securityId), ltp);
  }

  public position(
    exchangeSegment: string,
    securityId: string,
  ): LedgerPosition | undefined {
    return this.positions.get(keyFor(exchangeSegment, securityId));
  }

  /** Positions with open quantity — excludes symbols that have gone flat. */
  public openPositions(): LedgerPosition[] {
    return [...this.positions.values()].filter(
      (position) => position.netQuantity !== 0,
    );
  }

  /** Every symbol ever filled, open or flat, so closed-trade `realizedPnl` stays visible. */
  public allPositions(): LedgerPosition[] {
    return [...this.positions.values()];
  }

  /** Full fill history across every symbol, in the order `recordFill()` was called. */
  public fills(): readonly Fill[] {
    return this.history;
  }

  /** Sum of `realizedPnl` across every symbol, open or flat. */
  public totalRealizedPnl(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.realizedPnl;
    }
    return total;
  }

  /**
   * Mark-to-market exposure per open symbol and in aggregate. Falls back to
   * a symbol's `averagePrice` for any position `onTick()` hasn't seen a
   * price for yet.
   */
  public exposure(): { bySymbol: PositionExposure[]; total: number } {
    const bySymbol: PositionExposure[] = [];
    let total = 0;

    for (const position of this.openPositions()) {
      const key = keyFor(position.exchangeSegment, position.securityId);
      const markPrice = this.markPrices.get(key) ?? position.averagePrice;
      const exposureValue = Math.abs(position.netQuantity) * markPrice;

      bySymbol.push({
        exchangeSegment: position.exchangeSegment,
        securityId: position.securityId,
        netQuantity: position.netQuantity,
        markPrice,
        exposure: exposureValue,
        unrealizedPnl:
          (markPrice - position.averagePrice) * position.netQuantity,
      });
      total += exposureValue;
    }

    return { bySymbol, total };
  }

  /** Drops every position, fill, and mark price. */
  public reset(): void {
    this.positions.clear();
    this.markPrices.clear();
    this.history.length = 0;
  }
}
