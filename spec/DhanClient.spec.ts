import type { AxiosInstance } from "axios";

import {
  ApiResponseError,
  CircuitOpenError,
  DhanAuth,
  DhanClient,
  HttpClient,
  MarketFeedWS,
  OrderUpdateWS,
  RateLimitError,
  ValidationError,
} from "../src";

function createAxiosStub() {
  const requests: Array<{
    method?: string;
    url?: string;
    data?: unknown;
    headers?: unknown;
  }> = [];
  const queue: Array<() => Promise<{ data: unknown }>> = [];

  const axiosInstance = {
    request: jest.fn(async (config) => {
      requests.push(config);
      const next = queue.shift();
      if (!next) {
        throw new Error("No response queued");
      }

      return next();
    }),
  } as unknown as AxiosInstance;

  return {
    axiosInstance,
    requests,
    enqueueSuccess(data: unknown) {
      queue.push(async () => ({ data }));
    },
    enqueueFailure(error: Error) {
      queue.push(async () => {
        throw error;
      });
    },
  };
}

class FakeSocket {
  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  public readonly sent: string[] = [];
  public closed = false;
  public readonly url?: string;

  constructor(url?: string) {
    this.url = url;
  }

  public on(event: string, listener: (...args: unknown[]) => void): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(listener);
    this.handlers.set(event, existing);
  }

  public send(data: string | Buffer): void {
    this.sent.push(typeof data === "string" ? data : data.toString("hex"));
  }

  public close(): void {
    this.closed = true;
  }

  public emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }
}

function createFullPacket(options: {
  responseCode?: number;
  exchangeSegmentCode?: number;
  securityId?: number;
  ltp?: number;
}) {
  const buffer = Buffer.alloc(162);
  buffer.writeUInt8(options.responseCode ?? 8, 0);
  buffer.writeInt16LE(162, 1);
  buffer.writeUInt8(options.exchangeSegmentCode ?? 1, 3);
  buffer.writeInt32LE(options.securityId ?? 12345, 4);
  buffer.writeFloatLE(options.ltp ?? 100.5, 8);
  buffer.writeInt16LE(2, 12);
  buffer.writeInt32LE(1711000000, 14);
  buffer.writeFloatLE(100.25, 18);
  buffer.writeInt32LE(5000, 22);
  buffer.writeInt32LE(2000, 26);
  buffer.writeInt32LE(3000, 30);
  buffer.writeInt32LE(100, 34);
  buffer.writeInt32LE(125, 38);
  buffer.writeInt32LE(95, 42);
  buffer.writeFloatLE(99, 46);
  buffer.writeFloatLE(98, 50);
  buffer.writeFloatLE(101, 54);
  buffer.writeFloatLE(97, 58);
  return buffer;
}

describe("DhanClient", () => {
  it("injects correlationId and client id for order placement", async () => {
    const axiosStub = createAxiosStub();
    axiosStub.enqueueSuccess({
      orderId: "order-1",
      orderStatus: "PENDING",
    });

    const client = new DhanClient(
      {
        token: "token",
        clientId: "client-id",
      },
      { axiosInstance: axiosStub.axiosInstance },
    );

    const result = await client.orders.place({
      transactionType: "BUY",
      exchangeSegment: "NSE_FNO",
      productType: "INTRADAY",
      orderType: "MARKET",
      quantity: 10,
      securityId: "12345",
    });

    expect(result.data.orderId).toBe("order-1");
    expect(result.correlationId).toBeTruthy();
    expect(axiosStub.requests[0]).toMatchObject({
      method: "POST",
      url: "/orders",
    });
    expect(axiosStub.requests[0]?.data).toMatchObject({
      dhanClientId: "client-id",
      correlationId: result.correlationId,
    });
  });

  it("preserves caller correlationId on order placement", async () => {
    const axiosStub = createAxiosStub();
    axiosStub.enqueueSuccess({
      orderId: "order-2",
    });

    const client = new DhanClient(
      {
        token: "token",
        clientId: "client-id",
      },
      { axiosInstance: axiosStub.axiosInstance },
    );

    const result = await client.orders.place({
      correlationId: "corr-1",
      transactionType: "BUY",
      exchangeSegment: "NSE_EQ",
      productType: "CNC",
      orderType: "MARKET",
      quantity: 1,
      securityId: "12345",
    });

    expect(result.correlationId).toBe("corr-1");
    expect(axiosStub.requests[0]?.data).toMatchObject({
      correlationId: "corr-1",
    });
  });

  it("rejects invalid order payloads before transport", async () => {
    const axiosStub = createAxiosStub();
    const client = new DhanClient(
      {
        token: "token",
        clientId: "client-id",
      },
      { axiosInstance: axiosStub.axiosInstance },
    );

    await expect(
      client.orders.place({
        transactionType: "BUY",
        exchangeSegment: "NSE_FNO",
        productType: "INTRADAY",
        orderType: "STOP_LOSS",
        quantity: 10,
        securityId: "12345",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(axiosStub.requests).toHaveLength(0);
  });

  it("retries safe GET requests once on server errors", async () => {
    const axiosStub = createAxiosStub();
    axiosStub.enqueueFailure({
      isAxiosError: true,
      response: {
        status: 503,
        data: { message: "busy" },
      },
      message: "server error",
      name: "AxiosError",
    } as never);
    axiosStub.enqueueSuccess([{ orderId: "order-1" }]);

    const httpClient = new HttpClient(
      {
        token: "token",
        clientId: "client-id",
      },
      { axiosInstance: axiosStub.axiosInstance },
    );

    const response = await httpClient.request<Array<{ orderId: string }>>({
      method: "GET",
      url: "/orders",
      safeToRetry: true,
    });

    expect(response).toEqual([{ orderId: "order-1" }]);
    expect(axiosStub.requests).toHaveLength(2);
  });

  it("retries once on 401 with tokenProvider", async () => {
    const axiosStub = createAxiosStub();
    const onTokenExpired = jest.fn();
    const tokenProvider = jest
      .fn()
      .mockResolvedValueOnce("token-1")
      .mockResolvedValueOnce("token-2");
    axiosStub.enqueueFailure({
      isAxiosError: true,
      response: {
        status: 401,
        data: { message: "expired" },
      },
      message: "unauthorized",
      name: "AxiosError",
    } as never);
    axiosStub.enqueueSuccess([{ orderId: "order-1" }]);

    const httpClient = new HttpClient(
      {
        clientId: "client-id",
        tokenProvider,
        onTokenExpired,
      },
      { axiosInstance: axiosStub.axiosInstance },
    );

    const response = await httpClient.request<Array<{ orderId: string }>>({
      method: "GET",
      url: "/orders",
      safeToRetry: true,
    });

    expect(response).toEqual([{ orderId: "order-1" }]);
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
    expect(tokenProvider).toHaveBeenCalledTimes(2);
    expect(axiosStub.requests[0]?.headers).toMatchObject({
      "access-token": "token-1",
    });
    expect(axiosStub.requests[1]?.headers).toMatchObject({
      "access-token": "token-2",
    });
  });

  it("does not retry unsafe writes on API failures", async () => {
    const axiosStub = createAxiosStub();
    axiosStub.enqueueFailure({
      isAxiosError: true,
      response: {
        status: 503,
        data: { message: "busy" },
      },
      message: "server error",
      name: "AxiosError",
    } as never);

    const client = new DhanClient(
      {
        token: "token",
        clientId: "client-id",
      },
      { axiosInstance: axiosStub.axiosInstance },
    );

    await expect(
      client.orders.place({
        transactionType: "BUY",
        exchangeSegment: "NSE_FNO",
        productType: "INTRADAY",
        orderType: "MARKET",
        quantity: 10,
        securityId: "12345",
      }),
    ).rejects.toBeInstanceOf(ApiResponseError);

    expect(axiosStub.requests).toHaveLength(1);
  });

  it("classifies a 429 response as RateLimitError with the parsed error body and Retry-After header", async () => {
    const axiosStub = createAxiosStub();
    axiosStub.enqueueFailure({
      isAxiosError: true,
      response: {
        status: 429,
        data: {
          errorType: "Rate_Limit",
          errorCode: "DH-904",
          errorMessage: "Too many requests",
        },
        headers: { "retry-after": "2" },
      },
      message: "rate limited",
      name: "AxiosError",
    } as never);

    const httpClient = new HttpClient(
      { token: "token", clientId: "client-id" },
      { axiosInstance: axiosStub.axiosInstance },
    );

    const error = await httpClient
      .request({ method: "GET", url: "/orders" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    const rateLimitError = error as RateLimitError;
    expect(rateLimitError.status).toBe(429);
    expect(rateLimitError.retryAfterMs).toBe(2000);
    expect(rateLimitError.errorCode).toBe("DH-904");
    expect(rateLimitError.errorType).toBe("Rate_Limit");
    expect(rateLimitError.errorMessage).toBe("Too many requests");
  });

  it("classifies a DH-904 error body as RateLimitError even without HTTP 429", async () => {
    const axiosStub = createAxiosStub();
    axiosStub.enqueueFailure({
      isAxiosError: true,
      response: {
        status: 400,
        data: { errorType: "Rate_Limit", errorCode: "DH-904" },
      },
      message: "rate limited",
      name: "AxiosError",
    } as never);

    const httpClient = new HttpClient(
      { token: "token", clientId: "client-id" },
      { axiosInstance: axiosStub.axiosInstance },
    );

    await expect(
      httpClient.request({ method: "GET", url: "/orders" }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("retries a safe-to-retry GET after a 429, waiting for the Retry-After delay", async () => {
    const axiosStub = createAxiosStub();
    axiosStub.enqueueFailure({
      isAxiosError: true,
      response: {
        status: 429,
        data: { errorCode: "DH-904" },
        headers: { "retry-after": "0" },
      },
      message: "rate limited",
      name: "AxiosError",
    } as never);
    axiosStub.enqueueSuccess({ orders: [] });

    const httpClient = new HttpClient(
      { token: "token", clientId: "client-id" },
      { axiosInstance: axiosStub.axiosInstance },
    );

    const result = await httpClient.request({
      method: "GET",
      url: "/orders",
      safeToRetry: true,
    });

    expect(result).toEqual({ orders: [] });
    expect(axiosStub.requests).toHaveLength(2);
  });

  it("exposes the parsed Dhan error body on ApiResponseError for non-rate-limit failures", async () => {
    const axiosStub = createAxiosStub();
    axiosStub.enqueueFailure({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          errorType: "Order_Error",
          errorCode: "DH-906",
          errorMessage: "Invalid order type",
        },
      },
      message: "bad request",
      name: "AxiosError",
    } as never);

    const httpClient = new HttpClient(
      { token: "token", clientId: "client-id" },
      { axiosInstance: axiosStub.axiosInstance },
    );

    const error = await httpClient
      .request({ method: "GET", url: "/orders" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiResponseError);
    const apiError = error as ApiResponseError;
    expect(apiError.errorCode).toBe("DH-906");
    expect(apiError.errorType).toBe("Order_Error");
    expect(apiError.errorMessage).toBe("Invalid order type");
  });

  it("opens the circuit breaker after repeated 5xx failures and short-circuits further calls", async () => {
    const axiosStub = createAxiosStub();
    const serverError = {
      isAxiosError: true,
      response: { status: 503, data: { message: "busy" } },
      message: "server error",
      name: "AxiosError",
    };

    const httpClient = new HttpClient(
      { token: "token", clientId: "client-id" },
      { axiosInstance: axiosStub.axiosInstance },
    );

    // Default threshold is 5 consecutive failures.
    for (let i = 0; i < 5; i += 1) {
      axiosStub.enqueueFailure(serverError as never);
      await expect(
        httpClient.request({ method: "GET", url: "/orders" }),
      ).rejects.toBeInstanceOf(ApiResponseError);
    }

    expect(axiosStub.requests).toHaveLength(5);
    expect(httpClient.getCircuitState()).toBe("open");

    await expect(
      httpClient.request({ method: "GET", url: "/orders" }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    // No new request went out — the breaker rejected before touching the network.
    expect(axiosStub.requests).toHaveLength(5);
  });

  it("does not trip the circuit breaker on validation failures", async () => {
    const axiosStub = createAxiosStub();
    const client = new DhanClient(
      { token: "token", clientId: "client-id" },
      { axiosInstance: axiosStub.axiosInstance },
    );

    for (let i = 0; i < 5; i += 1) {
      await expect(
        client.orders.place({
          transactionType: "BUY",
          exchangeSegment: "NSE_FNO",
          productType: "INTRADAY",
          orderType: "STOP_LOSS",
          quantity: 10,
          securityId: "12345",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    }

    axiosStub.enqueueSuccess({ orderId: "order-1" });
    const result = await client.orders.list();
    expect(result).toBeDefined();
  });

  it("tracks market feed subscriptions and updates ltp store", async () => {
    const socket = new FakeSocket();
    const market = new MarketFeedWS(
      {
        token: "token",
        clientId: "client-id",
        webSocketFactory: () => socket,
      },
      clientLtpStore(),
    );
    const onTick = jest.fn();
    const onOpen = jest.fn();

    market.on("tick", onTick);
    market.on("open", onOpen);

    market.subscribe([{ securityId: "12345", exchangeSegment: "NSE_FNO" }]);
    await market.connect();

    socket.emit("open");

    expect(onOpen).toHaveBeenCalled();
    expect(JSON.parse(socket.sent[0] ?? "")).toEqual({
      RequestCode: 21,
      InstrumentCount: 1,
      InstrumentList: [{ SecurityId: "12345", ExchangeSegment: "NSE_FNO" }],
    });

    socket.emit("message", createFullPacket({ securityId: 12345, ltp: 100.5 }));

    expect(onTick).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "full",
        securityId: "12345",
        exchangeSegment: "NSE_FNO",
        ltp: 100.5,
      }),
    );

    market.disconnect();
  });

  it("unrefs its heartbeat timer so a live connection alone can't keep the process alive", async () => {
    const socket = new FakeSocket();
    const market = new MarketFeedWS(
      { token: "token", clientId: "client-id", webSocketFactory: () => socket },
      clientLtpStore(),
    );

    await market.connect();
    socket.emit("open");

    const pingInterval = (market as unknown as { pingInterval?: NodeJS.Timeout }).pingInterval;
    expect(pingInterval).toBeDefined();
    expect(pingInterval?.hasRef()).toBe(false);

    market.disconnect();
  });

  it("authenticates order update ws and stores events", async () => {
    const socket = new FakeSocket();
    const orderStore = clientOrderStore();
    const orders = new OrderUpdateWS({
      token: "token",
      clientId: "client-id",
      webSocketFactory: () => socket,
    }, orderStore);
    const onOrder = jest.fn();
    const onOpen = jest.fn();

    orders.on("order", onOrder);
    orders.on("open", onOpen);

    await orders.connect();

    socket.emit("open");
    await Promise.resolve();

    expect(onOpen).toHaveBeenCalled();
    expect(socket.sent).toEqual([
      JSON.stringify({
        LoginReq: {
          MsgCode: 42,
          ClientId: "client-id",
          Token: "token",
        },
        UserType: "SELF",
      }),
    ]);

    socket.emit(
      "message",
      JSON.stringify({
        Type: "order_alert",
        Data: {
          OrderNo: "order-1",
          CorrelationId: "corr-1",
          Status: "TRADED",
          TradedQty: 10,
          AvgTradedPrice: 100.5,
          SecurityId: "12345",
        },
      }),
    );

    expect(onOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        correlationId: "corr-1",
        status: "TRADED",
      }),
    );
    expect(orderStore.getByOrderId("order-1")).toEqual(
      expect.objectContaining({
        correlationId: "corr-1",
        status: "TRADED",
      }),
    );

    orders.disconnect();
  });

  it("supports partner auth for order update ws", async () => {
    const socket = new FakeSocket();
    const orders = new OrderUpdateWS(
      {
        clientId: "client-id",
        userType: "PARTNER",
        partnerId: "partner-id",
        partnerSecret: "partner-secret",
        webSocketFactory: () => socket,
      },
      clientOrderStore(),
    );

    await orders.connect();
    socket.emit("open");
    await Promise.resolve();

    expect(socket.sent).toEqual([
      JSON.stringify({
        LoginReq: {
          MsgCode: 42,
          ClientId: "partner-id",
        },
        UserType: "PARTNER",
        Secret: "partner-secret",
      }),
    ]);

    orders.disconnect();
  });

  it("generates deterministic totp for known timestamp", () => {
    const code = DhanAuth.generateTotp("JBSWY3DPEHPK3PXP", {
      timestamp: 0,
    });

    expect(code).toBe("282760");
  });
});

function clientLtpStore() {
  const { LTPStore } = require("../src");
  return new LTPStore();
}

function clientOrderStore() {
  const { OrderStore } = require("../src");
  return new OrderStore();
}
