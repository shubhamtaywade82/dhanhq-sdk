import type { CorrelatedRequest } from "./common.types";

export type TransactionType = "BUY" | "SELL";
export type ExchangeSegment =
  "NSE_EQ" | "NSE_FNO" | "NSE_COMM" | "BSE_EQ" | "BSE_FNO" | "MCX_COMM";
export type ProductType = "CNC" | "INTRADAY" | "MARGIN" | "MTF" | "BO" | "CO";
export type OrderType = "MARKET" | "LIMIT" | "STOP_LOSS" | "STOP_LOSS_MARKET";
export type Validity = "DAY" | "IOC";

export interface PlaceOrderRequest extends CorrelatedRequest {
  dhanClientId?: string;
  transactionType: TransactionType;
  exchangeSegment: ExchangeSegment;
  productType: ProductType;
  orderType: OrderType;
  validity?: Validity;
  quantity: number;
  disclosedQuantity?: number;
  price?: number;
  triggerPrice?: number;
  afterMarketOrder?: boolean;
  amoTime?: string;
  securityId: string;
  boProfitValue?: number;
  boStopLossValue?: number;
}

export interface ModifyOrderRequest {
  orderId: string;
  orderType?: OrderType;
  validity?: Validity;
  quantity?: number;
  disclosedQuantity?: number;
  price?: number;
  triggerPrice?: number;
}

export interface CancelOrderRequest {
  orderId: string;
}

export interface TradeHistoryRequest {
  fromDate: string;
  toDate: string;
  pageNumber?: string;
}

export interface OrderResponse {
  orderId: string;
  orderStatus?: string;
  correlationId?: string;
  [key: string]: unknown;
}

export interface TradeResponse {
  [key: string]: unknown;
}
