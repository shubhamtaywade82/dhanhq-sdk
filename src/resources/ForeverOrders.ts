import type {
  GttModifyRequest,
  GTTOrderModel,
  GttOrderResponse,
  GttOrderStatusResponse,
} from "../generated";

import { HttpClient } from "../client/HttpClient";

/**
 * Plain string-literal request shapes for {@link ForeverOrders} — the
 * generated `GTTOrderModel`/`GttModifyRequest` types use TS enums for these
 * fields, so `transactionType: "BUY"` doesn't type-check against them
 * directly (`"BUY"` isn't assignable to `GTTOrderModel.transactionType`,
 * only `GTTOrderModel.transactionType.BUY` is). Deriving the literal unions
 * from the enums via `${Enum}` keeps them in sync with `npm run generate`
 * without hand-transcribing every member.
 */
export interface PlaceForeverOrderRequest {
  dhanClientId?: string;
  correlationId?: string;
  orderFlag?: `${GTTOrderModel.orderFlag}`;
  transactionType: `${GTTOrderModel.transactionType}`;
  exchangeSegment?: `${GTTOrderModel.exchangeSegment}`;
  productType?: `${GTTOrderModel.productType}`;
  orderType?: `${GTTOrderModel.orderType}`;
  /** Valid for 1Year/Expiry */
  validity?: string;
  securityId?: string;
  quantity?: number;
  disclosedQuantity?: number;
  price?: number;
  triggerPrice?: number;
  /** Target price for OCO order */
  price1?: number;
  /** Target trigger price for OCO order */
  triggerPrice1?: number;
  /** Target quantity for OCO order */
  quantity1?: number;
}

export interface ModifyForeverOrderRequest {
  dhanClientId?: string;
  orderId?: string;
  orderFlag?: `${GttModifyRequest.orderFlag}`;
  orderType?: `${GttModifyRequest.orderType}`;
  legName?: `${GttModifyRequest.legName}`;
  quantity?: number;
  price?: number;
  disclosedQuantity?: number;
  triggerPrice?: number;
  validity?: string;
}

export class ForeverOrders {
  constructor(private readonly httpClient: HttpClient) {}

  public async list(): Promise<GttOrderResponse[]> {
    return this.httpClient.request<GttOrderResponse[]>({
      method: "GET",
      url: "/forever/orders",
      safeToRetry: true,
      tier: "order_api",
    });
  }

  public async place(
    request: PlaceForeverOrderRequest,
  ): Promise<GttOrderStatusResponse> {
    return this.httpClient.request<
      GttOrderStatusResponse,
      PlaceForeverOrderRequest
    >({
      method: "POST",
      url: "/forever/orders",
      data: request,
      safeToRetry: false,
      tier: "order_api",
    });
  }

  public async modify(
    orderId: string,
    request: ModifyForeverOrderRequest,
  ): Promise<GttOrderStatusResponse> {
    return this.httpClient.request<
      GttOrderStatusResponse,
      ModifyForeverOrderRequest
    >({
      method: "PUT",
      url: `/forever/orders/${encodeURIComponent(orderId)}`,
      data: request,
      safeToRetry: false,
      tier: "order_api",
    });
  }

  public async cancel(orderId: string): Promise<GttOrderStatusResponse> {
    return this.httpClient.request<GttOrderStatusResponse>({
      method: "DELETE",
      url: `/forever/orders/${encodeURIComponent(orderId)}`,
      safeToRetry: false,
      tier: "order_api",
    });
  }
}
