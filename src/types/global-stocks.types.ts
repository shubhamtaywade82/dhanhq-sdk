import type { CorrelatedRequest } from "./common.types";

/**
 * Global Stocks (US equities), served under `/v2/globalstocks/*`.
 *
 * A separate book from domestic NSE/BSE trading. These orders carry no
 * exchange segment, product type or validity, quantities are fractional, and
 * balances are in USD — so none of the domestic order types apply here, and
 * the two books deliberately never mix.
 */

export type GlobalOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP_LOSS"
  | "STOP_LOSS_MARKET"
  /** Notional order: spend a dollar `amount` rather than buy a quantity. */
  | "AMOUNT";

export type GlobalLegName = "ENTRY_LEG" | "STOP_LOSS_LEG" | "TARGET_LEG" | "NA";

export interface GlobalPlaceOrderRequest extends CorrelatedRequest {
  dhanClientId?: string;
  transactionType: "BUY" | "SELL";
  orderType: GlobalOrderType;
  securityId: string;
  /** Fractional shares are allowed. Required unless `orderType` is `AMOUNT`. */
  quantity?: number;
  price?: number;
  triggerPrice?: number;
  stopLossPrice?: number;
  targetPrice?: number;
  /** Dollar value for `AMOUNT` orders. Required when `orderType` is `AMOUNT`. */
  amount?: number;
  afterMarketOrder?: boolean;
}

export interface GlobalModifyOrderRequest {
  orderId: string;
  transactionType: "BUY" | "SELL";
  orderType: GlobalOrderType;
  securityId: string;
  quantity?: number;
  price?: number;
  legName?: GlobalLegName;
  dhanClientId?: string;
}

export interface GlobalOrderResponse {
  dhanClientId?: string;
  orderId?: string;
  exchangeOrderId?: string;
  correlationId?: string;
  orderStatus?: string;
  transactionType?: string;
  orderType?: GlobalOrderType;
  securityId?: string;
  tradingSymbol?: string;
  quantity?: number;
  filledQty?: number;
  price?: number;
  triggerPrice?: number;
  amount?: number;
  createTime?: string;
  updateTime?: string;
  omsErrorDescription?: string;
  [key: string]: unknown;
}

export interface GlobalHoldingResponse {
  dhanClientId?: string;
  securityId?: string;
  tradingSymbol?: string;
  displayName?: string;
  totalQty?: number;
  availableQty?: number;
  avgCostPrice?: number;
  lastTradedPrice?: number;
  currentValue?: number;
  investedValue?: number;
  totalGain?: number;
  dayChange?: number;
  [key: string]: unknown;
}

export interface GlobalTradeResponse {
  dhanClientId?: string;
  orderId?: string;
  exchangeOrderId?: string;
  securityId?: string;
  tradingSymbol?: string;
  transactionType?: string;
  tradedQuantity?: number;
  tradedPrice?: number;
  exchangeTime?: string;
  [key: string]: unknown;
}

export interface GlobalFundsResponse {
  dhanClientId?: string;
  /** All balances are USD. */
  availableCash?: number;
  cashOnAccount?: number;
  actualCash?: number;
  withdrawableBalance?: number;
  utilizedAmount?: number;
  [key: string]: unknown;
}

export interface GlobalMarketStatusResponse {
  status?: "open" | "closed" | string;
  marketOpenTime?: string;
  marketCloseTime?: string;
  holidayFlag?: string | boolean;
  [key: string]: unknown;
}

export interface GlobalEstimateRequest {
  securityId: string;
  transactionType: "BUY" | "SELL";
  price: number;
  quantity: number;
}

export interface GlobalOrderEstimateResponse {
  brokerage?: number;
  orderCharges?: number;
  exchangeCharges?: number;
  turnOverFee?: number;
  stampDuty?: number;
  gst?: number;
  [key: string]: unknown;
}

export interface GlobalMarginResponse {
  insufficientBal?: number;
  brokerage?: number;
  leverage?: number;
  totalMargin?: number;
  availableBal?: number;
  [key: string]: unknown;
}

/** Charges plus margin in one shape, for affordability decisions. */
export interface GlobalOrderCostSummary {
  totalCharges: number;
  brokerage: number;
  totalMargin: number;
  availableBalance: number;
  /** True when the available USD balance covers the required margin. */
  sufficient: boolean;
}
