/**
 * Enumerations and helper lookups shared by the REST, WebSocket, risk, skill and
 * agent layers. Mirrors `DhanHQ::Constants` in the Ruby gem.
 */

export const ExchangeSegment = {
  IDX_I: "IDX_I",
  NSE_EQ: "NSE_EQ",
  NSE_FNO: "NSE_FNO",
  NSE_CURRENCY: "NSE_CURRENCY",
  NSE_COMM: "NSE_COMM",
  BSE_EQ: "BSE_EQ",
  MCX_COMM: "MCX_COMM",
  BSE_CURRENCY: "BSE_CURRENCY",
  BSE_FNO: "BSE_FNO",
  /**
   * US / international equities, traded through the Global Stocks APIs
   * (`/v2/globalstocks/*`). Deliberately excluded from `ALL` so it can never
   * satisfy a domestic order contract.
   */
  INX_EQ: "INX_EQ",
} as const;

export const EXCHANGE_SEGMENTS = [
  ExchangeSegment.IDX_I,
  ExchangeSegment.NSE_EQ,
  ExchangeSegment.NSE_FNO,
  ExchangeSegment.NSE_CURRENCY,
  ExchangeSegment.NSE_COMM,
  ExchangeSegment.BSE_EQ,
  ExchangeSegment.MCX_COMM,
  ExchangeSegment.BSE_CURRENCY,
  ExchangeSegment.BSE_FNO,
] as const;

/** Segments served by the Global Stocks APIs. */
export const GLOBAL_EXCHANGE_SEGMENTS = [ExchangeSegment.INX_EQ] as const;

/** Segments allowed by `POST /v2/margincalculator` (single and multi). */
export const MARGIN_CALC_SEGMENTS = [
  ExchangeSegment.NSE_EQ,
  ExchangeSegment.NSE_FNO,
  ExchangeSegment.BSE_EQ,
  ExchangeSegment.BSE_FNO,
  ExchangeSegment.MCX_COMM,
] as const;

/** Segments allowed by `POST /v2/forever/orders`. */
export const FOREVER_ORDER_SEGMENTS = MARGIN_CALC_SEGMENTS;

/** Segments for conditional triggers — equities and indices only. */
export const ALERT_CONDITION_SEGMENTS = [
  ExchangeSegment.NSE_EQ,
  ExchangeSegment.BSE_EQ,
  ExchangeSegment.IDX_I,
] as const;

/** Segments allowed by the charts endpoints (excludes `NSE_COMM`). */
export const CHART_SEGMENTS = [
  ExchangeSegment.IDX_I,
  ExchangeSegment.NSE_EQ,
  ExchangeSegment.NSE_FNO,
  ExchangeSegment.NSE_CURRENCY,
  ExchangeSegment.BSE_EQ,
  ExchangeSegment.BSE_FNO,
  ExchangeSegment.BSE_CURRENCY,
  ExchangeSegment.MCX_COMM,
] as const;

export const ProductType = {
  CNC: "CNC",
  INTRADAY: "INTRADAY",
  MARGIN: "MARGIN",
  MTF: "MTF",
  CO: "CO",
  BO: "BO",
} as const;

export const PRODUCT_TYPES = [
  ProductType.CNC,
  ProductType.INTRADAY,
  ProductType.MARGIN,
  ProductType.MTF,
  ProductType.CO,
  ProductType.BO,
] as const;

/** Product types allowed by the margin calculator. */
export const MARGIN_CALC_PRODUCT_TYPES = [
  ProductType.CNC,
  ProductType.INTRADAY,
  ProductType.MARGIN,
  ProductType.MTF,
] as const;

/** Product types allowed by `POST /v2/forever/orders`. */
export const FOREVER_ORDER_PRODUCT_TYPES = [
  ProductType.CNC,
  ProductType.MTF,
] as const;

export const TransactionType = {
  BUY: "BUY",
  SELL: "SELL",
} as const;

export const TRANSACTION_TYPES = [
  TransactionType.BUY,
  TransactionType.SELL,
] as const;

export const OrderTypeEnum = {
  LIMIT: "LIMIT",
  MARKET: "MARKET",
  STOP_LOSS: "STOP_LOSS",
  STOP_LOSS_MARKET: "STOP_LOSS_MARKET",
} as const;

export const ORDER_TYPES = [
  OrderTypeEnum.LIMIT,
  OrderTypeEnum.MARKET,
  OrderTypeEnum.STOP_LOSS,
  OrderTypeEnum.STOP_LOSS_MARKET,
] as const;

export const ValidityEnum = {
  DAY: "DAY",
  IOC: "IOC",
} as const;

export const VALIDITIES = [ValidityEnum.DAY, ValidityEnum.IOC] as const;

export const OrderStatus = {
  TRANSIT: "TRANSIT",
  PENDING: "PENDING",
  CLOSED: "CLOSED",
  TRIGGERED: "TRIGGERED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  PART_TRADED: "PART_TRADED",
  TRADED: "TRADED",
  EXPIRED: "EXPIRED",
  MODIFIED: "MODIFIED",
  /** In the documented `orderStatus` response enum of order, slice and super-order APIs. */
  INACTIVE: "INACTIVE",
} as const;

export const AmoTime = {
  PRE_OPEN: "PRE_OPEN",
  OPEN: "OPEN",
  OPEN_30: "OPEN_30",
  OPEN_60: "OPEN_60",
} as const;

export const ExpiryCode = {
  CURRENT: 0,
  NEXT: 1,
  FAR: 2,
} as const;

export const InstrumentType = {
  INDEX: "INDEX",
  FUTIDX: "FUTIDX",
  OPTIDX: "OPTIDX",
  EQUITY: "EQUITY",
  FUTSTK: "FUTSTK",
  OPTSTK: "OPTSTK",
  FUTCOM: "FUTCOM",
  OPTFUT: "OPTFUT",
  FUTCUR: "FUTCUR",
  OPTCUR: "OPTCUR",
} as const;

/** Minute intervals accepted by `POST /v2/charts/intraday`. */
export const ChartInterval = {
  ONE: "1",
  FIVE: "5",
  FIFTEEN: "15",
  TWENTY_FIVE: "25",
  SIXTY: "60",
} as const;

export const CHART_INTERVALS = [
  ChartInterval.ONE,
  ChartInterval.FIVE,
  ChartInterval.FIFTEEN,
  ChartInterval.TWENTY_FIVE,
  ChartInterval.SIXTY,
] as const;

export const OptionType = {
  CALL: "CALL",
  PUT: "PUT",
} as const;

/** Short-form option types used throughout the option chain payloads. */
export const OptionSide = {
  CE: "CE",
  PE: "PE",
} as const;

export const LegName = {
  ENTRY_LEG: "ENTRY_LEG",
  TARGET_LEG: "TARGET_LEG",
  STOP_LOSS_LEG: "STOP_LOSS_LEG",
} as const;

export const OrderFlag = {
  SINGLE: "SINGLE",
  OCO: "OCO",
} as const;

export const PositionType = {
  LONG: "LONG",
  SHORT: "SHORT",
} as const;

/** Request codes for the Live Market Feed WebSocket. */
export const FeedRequest = {
  CONNECT: 11,
  DISCONNECT: 12,
  SUBSCRIBE_TICKER: 15,
  UNSUBSCRIBE_TICKER: 16,
  SUBSCRIBE_QUOTE: 17,
  UNSUBSCRIBE_QUOTE: 18,
  SUBSCRIBE_FULL: 21,
  UNSUBSCRIBE_FULL: 22,
  SUBSCRIBE_DEPTH: 23,
  UNSUBSCRIBE_DEPTH: 24,
} as const;

/** Response codes on the Live Market Feed WebSocket. */
/**
 * Exchange segment numeric codes used in WebSocket packet headers (Annexure,
 * "Exchange Segment" enum column). 6 is unassigned.
 */
export const EXCHANGE_SEGMENT_BY_CODE: Readonly<Record<number, string>> = {
  0: ExchangeSegment.IDX_I,
  1: ExchangeSegment.NSE_EQ,
  2: ExchangeSegment.NSE_FNO,
  3: ExchangeSegment.NSE_CURRENCY,
  4: ExchangeSegment.BSE_EQ,
  5: ExchangeSegment.MCX_COMM,
  7: ExchangeSegment.BSE_CURRENCY,
  8: ExchangeSegment.BSE_FNO,
};

/** Segment name for a packet-header code, or `SEGMENT_<code>` when unknown. */
export function exchangeSegmentForCode(code: number): string {
  return EXCHANGE_SEGMENT_BY_CODE[code] ?? `SEGMENT_${code}`;
}

/** Full Market Depth per-connection instrument caps (docs: 50 for 20-level, 1 for 200-level). */
export const MARKET_DEPTH_LIMITS = {
  twenty: 50,
  twohundred: 1,
} as const;

export const FeedResponse = {
  INDEX_PACKET: 1,
  TICKER_PACKET: 2,
  QUOTE_PACKET: 4,
  OI_PACKET: 5,
  PREV_CLOSE_PACKET: 6,
  MARKET_STATUS_PACKET: 7,
  FULL_PACKET: 8,
  FEED_DISCONNECT: 50,
} as const;

/**
 * Global Stocks (US equities) enumerations, served under `/v2/globalstocks/*`.
 * These orders carry no exchange segment, product type or validity, so the
 * domestic {@link ProductType}/{@link ValidityEnum} enums do not apply.
 */
export const GlobalStocks = {
  EXCHANGE_SEGMENT: ExchangeSegment.INX_EQ,
  EXCHANGE_SEGMENT_CODE: 14,
  MAX_INSTRUMENTS_PER_REQUEST: 100,
  MAX_SUBSCRIPTIONS_PER_CONNECTION: 5000,
  MAX_CONNECTIONS_PER_CLIENT: 5,
  OrderType: {
    MARKET: "MARKET",
    LIMIT: "LIMIT",
    STOP_LOSS: "STOP_LOSS",
    STOP_LOSS_MARKET: "STOP_LOSS_MARKET",
    /** Notional / dollar-value orders — quantity is replaced by `amount`. */
    AMOUNT: "AMOUNT",
  },
  /** Leg names accepted when modifying a Global Stocks super order. */
  LegName: {
    ENTRY_LEG: "ENTRY_LEG",
    STOP_LOSS_LEG: "STOP_LOSS_LEG",
    TARGET_LEG: "TARGET_LEG",
    NA: "NA",
  },
  MarketStatus: {
    OPEN: "open",
    CLOSED: "closed",
  },
  MsgCode: {
    TRADE: 1,
    PREV_CLOSE: 32,
    CIRCUIT_LIMIT: 33,
    FIFTY_TWO_WEEK: 36,
  },
} as const;

export const GLOBAL_ORDER_TYPES = [
  GlobalStocks.OrderType.MARKET,
  GlobalStocks.OrderType.LIMIT,
  GlobalStocks.OrderType.STOP_LOSS,
  GlobalStocks.OrderType.STOP_LOSS_MARKET,
  GlobalStocks.OrderType.AMOUNT,
] as const;

export const ComparisonType = {
  TECHNICAL_WITH_VALUE: "TECHNICAL_WITH_VALUE",
  TECHNICAL_WITH_INDICATOR: "TECHNICAL_WITH_INDICATOR",
  TECHNICAL_WITH_CLOSE: "TECHNICAL_WITH_CLOSE",
  PRICE_WITH_VALUE: "PRICE_WITH_VALUE",
} as const;

export const Operator = {
  CROSSING_UP: "CROSSING_UP",
  CROSSING_DOWN: "CROSSING_DOWN",
  CROSSING_ANY_SIDE: "CROSSING_ANY_SIDE",
  GREATER_THAN: "GREATER_THAN",
  LESS_THAN: "LESS_THAN",
  GREATER_THAN_EQUAL: "GREATER_THAN_EQUAL",
  LESS_THAN_EQUAL: "LESS_THAN_EQUAL",
  EQUAL: "EQUAL",
  NOT_EQUAL: "NOT_EQUAL",
} as const;

export const TriggerStatus = {
  ACTIVE: "ACTIVE",
  TRIGGERED: "TRIGGERED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;

/** Trading API error codes (DH-900 series). */
export const TradingErrorCode = {
  INVALID_AUTHENTICATION: "DH-901",
  INVALID_ACCESS: "DH-902",
  USER_ACCOUNT: "DH-903",
  RATE_LIMIT: "DH-904",
  INPUT_EXCEPTION: "DH-905",
  ORDER_ERROR: "DH-906",
  DATA_ERROR: "DH-907",
  INTERNAL_SERVER_ERROR: "DH-908",
  NETWORK_ERROR: "DH-909",
  OTHERS: "DH-910",
  NO_HOLDINGS: "DH-1111",
} as const;

/**
 * Published DhanHQ rate limits per API tier. Order APIs 10/sec, Data APIs
 * 5/sec, Market Quote 1/sec, Option Chain one call every 3 seconds.
 */
export const RATE_LIMITS = {
  order_api: { perSecond: 10, perDay: 100_000 },
  data_api: { perSecond: 5, perDay: 7_000 },
  quote_api: { perSecond: 1, perDay: Infinity },
  option_chain: { perSecond: 1 / 3, perDay: 4_800 },
  non_trading_api: { perSecond: 20, perDay: Infinity },
} as const;

export type ApiTier = keyof typeof RATE_LIMITS;

/** Indian market hours in IST, used by the risk pipeline. */
export const MARKET_HOURS = {
  timezoneOffsetMinutes: 330,
  openHour: 9,
  openMinute: 15,
  closeHour: 15,
  closeMinute: 30,
  /** Minutes in a regular NSE trading session. */
  sessionMinutes: 375,
} as const;

/**
 * Maps a scrip-master `(EXCH_ID, SEGMENT)` pair to an exchange segment. Keyed
 * as `"EXCH_ID:SEGMENT"` because tuples are not usable as object keys.
 */
export const SEGMENT_MAP: Record<string, string> = {
  "NSE:E": ExchangeSegment.NSE_EQ,
  "BSE:E": ExchangeSegment.BSE_EQ,
  "NSE:D": ExchangeSegment.NSE_FNO,
  "BSE:D": ExchangeSegment.BSE_FNO,
  "NSE:C": ExchangeSegment.NSE_CURRENCY,
  "BSE:C": ExchangeSegment.BSE_CURRENCY,
  "MCX:M": ExchangeSegment.MCX_COMM,
  "NSE:I": ExchangeSegment.IDX_I,
  "BSE:I": ExchangeSegment.IDX_I,
};

export const GLOBAL_LEG_NAMES = [
  GlobalStocks.LegName.ENTRY_LEG,
  GlobalStocks.LegName.STOP_LOSS_LEG,
  GlobalStocks.LegName.TARGET_LEG,
  GlobalStocks.LegName.NA,
] as const;

/** Global Stocks order types that require a limit price. */
export const GLOBAL_PRICED_ORDER_TYPES = [
  GlobalStocks.OrderType.LIMIT,
] as const;

/** Global Stocks order types that require a trigger price. */
export const GLOBAL_TRIGGERED_ORDER_TYPES = [
  GlobalStocks.OrderType.STOP_LOSS,
  GlobalStocks.OrderType.STOP_LOSS_MARKET,
] as const;
