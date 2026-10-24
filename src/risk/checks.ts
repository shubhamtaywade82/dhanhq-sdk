import { MARKET_HOURS, ProductType } from "../constants";
import { RiskViolationError } from "../errors";
import type { RiskCheck, RiskFunds, RiskPosition } from "./types";

/** Blocks instruments the exchange has flagged as not tradable. */
export const tradingPermissionCheck: RiskCheck = {
  name: "trading_permission",
  run({ instrument }) {
    if (!instrument) {
      return;
    }

    if (instrument.buySellIndicator !== "A") {
      throw new RiskViolationError(
        "trading_permission",
        `Trading disabled for instrument ${instrument.securityId}`,
      );
    }
  },
};

/** Blocks ASM/GSM surveillance-restricted instruments. */
export const asmGsmCheck: RiskCheck = {
  name: "asm_gsm",
  run({ instrument, reducing }) {
    // A position held before the instrument entered surveillance must stay closable.
    if (reducing || instrument?.asmGsmFlag !== "Y") {
      return;
    }

    throw new RiskViolationError(
      "asm_gsm",
      `ASM/GSM restricted instrument (${instrument.asmGsmCategory ?? "unknown category"})`,
    );
  },
};

/** Rejects BO/CO orders on instruments that do not support them. */
export const productSupportCheck: RiskCheck = {
  name: "product_support",
  run({ args, instrument }) {
    const productType = args.productType;
    if (!productType || !instrument) {
      return;
    }

    if (productType === ProductType.BO && instrument.bracketFlag !== "Y") {
      throw new RiskViolationError(
        "product_support",
        "Bracket orders not supported for this instrument",
      );
    }

    if (productType === ProductType.CO && instrument.coverFlag !== "Y") {
      throw new RiskViolationError(
        "product_support",
        "Cover orders not supported for this instrument",
      );
    }
  },
};

/** Restricts order types to the configured allowlist. */
export const orderTypeCheck: RiskCheck = {
  name: "order_type",
  run({ args, limits }) {
    const orderType = args.orderType;
    if (!orderType || limits.allowedOrderTypes.includes(orderType)) {
      return;
    }

    throw new RiskViolationError(
      "order_type",
      `Order type ${orderType} not allowed (permitted: ${limits.allowedOrderTypes.join(", ")})`,
    );
  },
};

/** Enforces per-order quantity and notional ceilings. */
export const quantityCheck: RiskCheck = {
  name: "quantity",
  run({ args, limits, reducing }) {
    const quantity = Number(args.quantity ?? 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new RiskViolationError("quantity", "Quantity must be greater than 0");
    }

    // Size caps bound new exposure; an exit up to the open position is allowed.
    if (reducing) {
      return;
    }

    if (quantity > limits.maxQuantity) {
      throw new RiskViolationError(
        "quantity",
        `Quantity ${quantity} exceeds limit of ${limits.maxQuantity}`,
      );
    }

    // A MARKET order has no price to check against, so notional is only
    // enforced where a price was supplied.
    if (args.price === undefined) {
      return;
    }

    const notional = quantity * Number(args.price);
    if (notional > limits.maxNotional) {
      throw new RiskViolationError(
        "quantity",
        `Notional ${notional} exceeds limit of ${limits.maxNotional}`,
      );
    }
  },
};

/** Blocks orders outside 09:15–15:30 IST. */
export const marketHoursCheck: RiskCheck = {
  name: "market_hours",
  run({ now = new Date() }) {
    const ist = new Date(
      now.getTime() + MARKET_HOURS.timezoneOffsetMinutes * 60 * 1000,
    );
    const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    const open = MARKET_HOURS.openHour * 60 + MARKET_HOURS.openMinute;
    const close = MARKET_HOURS.closeHour * 60 + MARKET_HOURS.closeMinute;
    const day = ist.getUTCDay();

    if (day === 0 || day === 6 || minutes < open || minutes > close) {
      throw new RiskViolationError("market_hours", "Market is closed");
    }
  },
};

/** Caps the number of concurrently open positions. */
export const positionLimitsCheck: RiskCheck = {
  name: "position_limits",
  async run({ provider, limits, reducing }) {
    if (!provider || reducing) {
      return;
    }

    const positions = await provider.positions();
    const openCount = positions.filter(
      (position) => Number(position.netQty ?? 0) !== 0,
    ).length;

    if (openCount >= limits.maxOpenPositions) {
      throw new RiskViolationError(
        "position_limits",
        `Maximum ${limits.maxOpenPositions} open positions exceeded (${openCount} open)`,
      );
    }
  },
};

/** Caps how much of the available balance a single symbol may represent. */
export const concentrationCheck: RiskCheck = {
  name: "concentration",
  async run({ args, provider, limits, reducing }) {
    const symbol = args.securityId;
    if (!provider || !symbol || reducing) {
      return;
    }

    const available = availableBalance(await provider.funds());
    if (available <= 0) {
      return;
    }

    const positions = await provider.positions();
    const exposure = positions
      .filter((position) => matchesSymbol(position, String(symbol)))
      .reduce(
        (total, position) =>
          total +
          Math.abs(Number(position.netQty ?? 0)) * Number(position.costPrice ?? 0),
        0,
      );

    // The order's own notional counts when it carries a price (LIMIT / SL, or
    // the trigger of SL-M); a plain MARKET order adds what it cannot price.
    const orderPrice = Number(args.price ?? 0) || Number(args.triggerPrice ?? 0);
    const orderNotional = Number(args.quantity ?? 0) * orderPrice;
    const concentration = ((exposure + orderNotional) / available) * 100;
    if (concentration > limits.maxConcentrationPct) {
      throw new RiskViolationError(
        "concentration",
        `Concentration ${concentration.toFixed(1)}% exceeds ${limits.maxConcentrationPct}% limit for ${symbol}`,
      );
    }
  },
};

/**
 * Stops new orders once the day's P&L — realized plus unrealized — crosses the
 * daily limit. A loss booked earlier in the day counts just as an open one does.
 */
export const maxLossCheck: RiskCheck = {
  name: "max_loss",
  async run({ provider, limits, reducing }) {
    if (!provider || reducing) {
      return;
    }

    const positions = await provider.positions();
    const dayPnl = positions.reduce(
      (total, position) =>
        total + Number(position.realizedProfit ?? 0) + Number(position.unrealizedProfit ?? 0),
      0,
    );

    if (dayPnl < -limits.dailyMaxLoss) {
      throw new RiskViolationError(
        "max_loss",
        `Daily loss limit of ${limits.dailyMaxLoss} exceeded (current: ${dayPnl.toFixed(0)})`,
      );
    }
  },
};

/**
 * Options-only rules: index underlyings, a stop loss and target on every
 * order, and a target further from entry than the stop.
 */
export const optionsCheck: RiskCheck = {
  name: "options",
  run({ args, instrument, limits, reducing }) {
    // Entry rules only: closing an option position needs no stop or target.
    if (reducing) {
      return;
    }

    if (limits.optionsIndexOnly && instrumentKind(instrument) !== "OPTIDX") {
      throw new RiskViolationError(
        "options",
        "Options are only allowed on index underlyings",
      );
    }

    if (!limits.requireOptionsStops) {
      return;
    }

    if (args.stopLoss === undefined) {
      throw new RiskViolationError("options", "Stop loss required");
    }

    if (args.target === undefined) {
      throw new RiskViolationError("options", "Target required");
    }

    if (Number(args.target) <= Number(args.stopLoss)) {
      throw new RiskViolationError(
        "options",
        "Invalid risk-reward: target must exceed stop loss",
      );
    }
  },
};

function matchesSymbol(position: RiskPosition, symbol: string): boolean {
  return (
    String(position.tradingSymbol ?? "") === symbol ||
    String(position.securityId ?? "") === symbol
  );
}

/**
 * `GET /v2/fundlimit` returns `availabelBalance` — the misspelling is in the
 * upstream API, so both spellings are accepted.
 */
export function availableBalance(funds: RiskFunds): number {
  return Number(funds.availabelBalance ?? funds.availableBalance ?? 0);
}

/**
 * The contract kind from the scrip master's `INSTRUMENT` column (`OPTIDX`,
 * `OPTSTK`, `FUTIDX`, `EQUITY`, ...). `INSTRUMENT_TYPE` is not usable for this:
 * NSE index and stock options both carry `OP` there.
 */
export function instrumentKind(instrument?: { instrument?: string; instrumentType?: string }): string {
  return String(instrument?.instrument ?? instrument?.instrumentType ?? "").toUpperCase();
}

/**
 * True when the order only shrinks an open position: the opposite side of a
 * non-zero position in the same security (and segment / product when both
 * sides name one), for no more than that position's size.
 */
export function isRiskReducing(
  args: { transactionType?: unknown; quantity?: unknown; securityId?: unknown; exchangeSegment?: unknown; productType?: unknown },
  positions: RiskPosition[],
): boolean {
  const quantity = Number(args.quantity ?? 0);
  const side = String(args.transactionType ?? "").toUpperCase();
  const securityId = String(args.securityId ?? "");
  if (!(quantity > 0) || (side !== "BUY" && side !== "SELL") || securityId === "") {
    return false;
  }

  const sameOrUnspecified = (wanted: unknown, actual: unknown) =>
    wanted === undefined || wanted === "" || actual === undefined || String(wanted) === String(actual);

  const position = positions.find(
    (candidate) =>
      Number(candidate.netQty ?? 0) !== 0 &&
      String(candidate.securityId ?? "") === securityId &&
      sameOrUnspecified(args.exchangeSegment, candidate.exchangeSegment) &&
      sameOrUnspecified(args.productType, candidate.productType),
  );
  if (!position) {
    return false;
  }

  const net = Number(position.netQty);
  const closes = side === "SELL" ? net > 0 : net < 0;
  return closes && quantity <= Math.abs(net);
}
