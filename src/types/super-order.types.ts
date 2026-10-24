import type { ExchangeSegment, TransactionType } from "./order.types";
import type { CorrelatedRequest } from "./common.types";

export type SuperOrderProductType = "CNC" | "INTRADAY" | "MARGIN" | "MTF";
export type SuperOrderType = "MARKET" | "LIMIT";
export type SuperOrderLeg = "ENTRY_LEG" | "STOP_LOSS_LEG" | "TARGET_LEG";

export interface PlaceSuperOrderRequest extends CorrelatedRequest {
  dhanClientId?: string;
  transactionType: TransactionType;
  exchangeSegment: ExchangeSegment;
  productType: SuperOrderProductType;
  orderType: SuperOrderType;
  quantity: number;
  price?: number;
  targetPrice?: number;
  stopLossPrice?: number;
  trailingJump?: number;
  securityId: string;
}

export interface ModifySuperOrderRequest {
  orderId: string;
  price?: number;
  targetPrice?: number;
  stopLossPrice?: number;
  quantity?: number;
}

export interface CancelSuperOrderRequest {
  orderId: string;
  orderLeg: SuperOrderLeg;
}

export interface SuperOrderResponse {
  orderId: string;
  orderStatus?: string;
  correlationId?: string;
  [key: string]: unknown;
}
