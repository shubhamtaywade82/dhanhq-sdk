import type { Instrument } from "../resources/Instruments";
import type { PlaceOrderRequest } from "../types/order.types";

/** Position fields the risk checks need, from `GET /v2/positions`. */
export interface RiskPosition {
  netQty?: number;
  exchangeSegment?: string;
  productType?: string;
  costPrice?: number;
  unrealizedProfit?: number;
  realizedProfit?: number;
  tradingSymbol?: string;
  securityId?: string;
  [key: string]: unknown;
}

/** Fund fields the risk checks need, from `GET /v2/fundlimit`. */
export interface RiskFunds {
  availabelBalance?: number;
  availableBalance?: number;
  [key: string]: unknown;
}

/**
 * Where the account-level checks get their data.
 *
 * Kept as an interface rather than a hard dependency on {@link DhanClient} so
 * checks can be unit-tested with fixtures, and so a caller that already has
 * positions in hand can pass them without a second API call.
 */
export interface RiskDataProvider {
  positions(): Promise<RiskPosition[]>;
  funds(): Promise<RiskFunds>;
}

/** Order arguments a check sees. Superset of a place-order request. */
export interface RiskOrderArgs extends Partial<PlaceOrderRequest> {
  stopLoss?: number;
  target?: number;
  [key: string]: unknown;
}

export interface RiskLimits {
  /** Largest quantity a single order may carry. */
  maxQuantity: number;
  /** Largest notional (quantity × price) a single order may carry. */
  maxNotional: number;
  /** Day loss (realized + unrealized) at which new orders stop, as a positive number. */
  dailyMaxLoss: number;
  /** Concurrent open positions allowed. */
  maxOpenPositions: number;
  /** Share of available balance one symbol may represent, in percent. */
  maxConcentrationPct: number;
  /** Order types permitted through the pipeline. */
  allowedOrderTypes: string[];
  /** Restrict options trading to index underlyings. */
  optionsIndexOnly: boolean;
  /** Require a stop loss and target on every options order. */
  requireOptionsStops: boolean;
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxQuantity: 10,
  maxNotional: 100_000,
  dailyMaxLoss: 50_000,
  maxOpenPositions: 20,
  maxConcentrationPct: 25,
  allowedOrderTypes: ["MARKET", "LIMIT"],
  optionsIndexOnly: true,
  requireOptionsStops: true,
};

export interface RiskContext {
  args: RiskOrderArgs;
  instrument?: Instrument;
  now?: Date;
  limits: RiskLimits;
  provider?: RiskDataProvider;
  /**
   * True when the order only reduces an open position (see `isRiskReducing`).
   * Limit checks never block such an order: refusing a stop-out because the
   * account is already over a limit turns a capped loss into an uncapped one.
   */
  reducing?: boolean;
}

/**
 * One pre-trade check. Throws {@link RiskViolationError} to reject; returning
 * normally means the order passed this check.
 */
export interface RiskCheck {
  name: string;
  run(context: RiskContext): Promise<void> | void;
}
