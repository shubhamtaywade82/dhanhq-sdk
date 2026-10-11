import type {
  AlertOrderResponse,
  GetAlertResponse,
} from "../generated";
import type { AlertConditionInput, AlertOrderInput } from "./ConditionalTriggers";

import { HttpClient } from "../client/HttpClient";

/**
 * Plain string-literal request shapes for {@link Alerts} — mirrors
 * {@link ConditionalTriggers}' `PlaceConditionalTriggerRequest`/
 * `ModifyConditionalTriggerRequest` (both resources wrap the same
 * `/alerts/orders` endpoints). Reusing `AlertConditionInput`/`AlertOrderInput`
 * keeps the enum-to-literal mapping in one place instead of duplicating it.
 */
export interface PlaceAlertRequest {
  dhanClientId: string;
  condition: AlertConditionInput;
  orders: AlertOrderInput[];
}

export interface ModifyAlertRequest {
  dhanClientId?: string;
  alertId?: string;
  condition?: AlertConditionInput;
  orders?: AlertOrderInput[];
}

/** One leg of `POST /alerts/multi/orders`. */
export interface MultiOrderLeg {
  /** Identifies the leg within the batch. */
  sequence: string;
  transactionType: "BUY" | "SELL";
  exchangeSegment: "NSE_EQ" | "NSE_FNO" | "NSE_COMM" | "BSE_EQ" | "BSE_FNO" | "MCX_COMM";
  productType?: "CNC" | "INTRADAY" | "MARGIN" | "MTF";
  orderType?: "LIMIT" | "MARKET" | "STOP_LOSS" | "STOP_LOSS_MARKET";
  validity?: "DAY" | "IOC";
  securityId?: string;
  quantity?: number;
  price?: number;
  triggerPrice?: number;
  disclosedQuantity?: number;
  afterMarketOrder?: boolean;
  amoTime?: "PRE_OPEN" | "OPEN" | "OPEN_30" | "OPEN_60";
  /** At most 30 characters. */
  correlationId?: string;
}

export interface PlaceMultiOrderRequest {
  dhanClientId?: string;
  orders: MultiOrderLeg[];
}

export class Alerts {
  constructor(private readonly httpClient: HttpClient) {}

  public async list(): Promise<GetAlertResponse[]> {
    return this.httpClient.request<GetAlertResponse[]>({
      method: "GET",
      url: "/alerts/orders",
      safeToRetry: true,
    });
  }

  public async getById(alertId: string): Promise<GetAlertResponse> {
    return this.httpClient.request<GetAlertResponse>({
      method: "GET",
      url: `/alerts/orders/${encodeURIComponent(alertId)}`,
      safeToRetry: true,
    });
  }

  public async place(
    request: PlaceAlertRequest,
  ): Promise<AlertOrderResponse> {
    return this.httpClient.request<AlertOrderResponse, PlaceAlertRequest>({
      method: "POST",
      url: "/alerts/orders",
      data: request,
      safeToRetry: false,
    });
  }

  /**
   * Places several orders in one request (`POST /alerts/multi/orders`). A
   * trading write: never retried. Production only — the sandbox does not
   * serve it, so a `sandbox`/`hybrid` client refuses it before sending.
   */
  public async placeMulti(request: PlaceMultiOrderRequest): Promise<unknown> {
    if (request.orders.length === 0) {
      throw new RangeError("placeMulti needs at least one order");
    }
    request.orders.forEach((leg, index) => {
      if (!leg.sequence || !leg.transactionType || !leg.exchangeSegment) {
        throw new RangeError(`placeMulti order ${index}: sequence, transactionType and exchangeSegment are required`);
      }
      if (leg.correlationId !== undefined && leg.correlationId.length > 30) {
        throw new RangeError(`placeMulti order ${index}: correlationId exceeds 30 characters`);
      }
    });

    return this.httpClient.request<unknown, PlaceMultiOrderRequest>({
      method: "POST",
      url: "/alerts/multi/orders",
      data: { ...request, dhanClientId: request.dhanClientId ?? this.httpClient.getClientId() },
      safeToRetry: false,
      tier: "order_api",
    });
  }

  public async modify(
    alertId: string,
    request: ModifyAlertRequest,
  ): Promise<AlertOrderResponse> {
    return this.httpClient.request<AlertOrderResponse, ModifyAlertRequest>({
      method: "PUT",
      url: `/alerts/orders/${encodeURIComponent(alertId)}`,
      data: request,
      safeToRetry: false,
    });
  }

  public async delete(alertId: string): Promise<AlertOrderResponse> {
    return this.httpClient.request<AlertOrderResponse>({
      method: "DELETE",
      url: `/alerts/orders/${encodeURIComponent(alertId)}`,
      safeToRetry: false,
    });
  }
}
