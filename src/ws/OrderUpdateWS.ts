import WebSocket from "ws";

import { AuthResolver } from "../auth";
import type {
  OrderState,
  OrderUpdateWSOptions,
  WebSocketLike,
} from "../types/ws.types";
import type { Logger } from "../types/logger.types";
import { BaseWS } from "./BaseWS";
import { OrderStore } from "./store/OrderStore";

export interface OrderUpdateWSOptionsWithLogger extends OrderUpdateWSOptions {
  logger?: Logger;
}

export class OrderUpdateWS extends BaseWS {
  private readonly authResolver: AuthResolver;
  private readonly clientId: string;
  private readonly orderStore: OrderStore;
  private readonly userType: "SELF" | "PARTNER";
  private readonly partnerId?: string;
  private readonly partnerSecret?: string;

  constructor(options: OrderUpdateWSOptionsWithLogger, orderStore: OrderStore) {
    const authResolver = new AuthResolver({
      token: options.token,
      tokenProvider: options.tokenProvider,
      clientId: options.clientId,
    });

    super(
      () => options.url ?? "wss://api-order-update.dhan.co",
      options.reconnectDelayMs ?? 1000,
      options.webSocketFactory ?? defaultFactory,
      options.maxReconnectDelayMs,
      options.maxReconnectAttempts,
      options.logger,
    );
    this.authResolver = authResolver;
    this.clientId = options.clientId;
    this.orderStore = orderStore;
    this.userType = options.userType ?? "SELF";
    this.partnerId = options.partnerId;
    this.partnerSecret = options.partnerSecret;
  }

  protected async onOpen(): Promise<void> {
    if (this.userType === "PARTNER") {
      this.send(
        JSON.stringify({
          LoginReq: {
            MsgCode: 42,
            ClientId: this.partnerId,
          },
          UserType: "PARTNER",
          Secret: this.partnerSecret,
        }),
      );
      this.emit("open");
      return;
    }

    const token = await this.authResolver.resolveAccessToken();
    this.send(
      JSON.stringify({
        LoginReq: {
          MsgCode: 42,
          ClientId: this.clientId,
          Token: token,
        },
        UserType: "SELF",
      }),
    );
    this.emit("open");
  }

  protected onMessage(data: unknown): void {
    const raw = toText(data);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as {
      Data?: Record<string, unknown>;
      Type?: string;
    };

    if (parsed.Type === "order_alert" && parsed.Data) {
      const state = toOrderState(parsed.Data);
      this.orderStore.upsert(state);
      this.emit("order", state);
    }
  }

  protected onClose(): void {
    this.emit("close");
  }
}

function defaultFactory(url: string): WebSocketLike {
  return new WebSocket(url);
}

function toText(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
      "utf8",
    );
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  return null;
}

function toOrderState(data: Record<string, unknown>): OrderState {
  return {
    orderId: typeof data.OrderNo === "string" ? data.OrderNo : undefined,
    correlationId:
      typeof data.CorrelationId === "string" && data.CorrelationId.length > 0
        ? data.CorrelationId
        : undefined,
    status: typeof data.Status === "string" ? data.Status : undefined,
    tradedQty: typeof data.TradedQty === "number" ? data.TradedQty : undefined,
    averageTradedPrice:
      typeof data.AvgTradedPrice === "number" ? data.AvgTradedPrice : undefined,
    securityId:
      typeof data.SecurityId === "string" ? data.SecurityId : undefined,
    raw: data,
  };
}
