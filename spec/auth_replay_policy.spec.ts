import { AxiosError, type AxiosInstance } from "axios";

import { HttpClient } from "../src/client/HttpClient";
import { RateLimiter } from "../src/client/RateLimiter";
import {
  ApiResponseError,
  AuthenticationError,
  NetworkError,
} from "../src/errors";
import { ConditionalTriggers } from "../src/resources/ConditionalTriggers";
import { ForeverOrders } from "../src/resources/ForeverOrders";
import { GlobalStocks } from "../src/resources/GlobalStocks";
import { Orders } from "../src/resources/Orders";
import { Positions } from "../src/resources/Positions";
import { SuperOrders } from "../src/resources/SuperOrders";
import { TraderControls } from "../src/resources/TraderControls";

/**
 * Invariant: `safeToRetry !== true` means no transport-level condition —
 * timeout, 5xx, or a 401 that triggers token renewal — may automatically
 * replay the request. A 401 still renews the token; it just never resends.
 */

type Responder = () => Promise<{ data: unknown }>;

function createAxiosStub() {
  const requests: Array<{
    method?: string;
    url?: string;
    data?: unknown;
    headers?: Record<string, string>;
  }> = [];
  const queue: Responder[] = [];

  const axiosInstance = {
    request: jest.fn(async (config) => {
      requests.push(config);
      const next = queue.shift();
      if (!next) {
        throw new Error(`No response queued for ${config.method} ${config.url}`);
      }
      return next();
    }),
  } as unknown as AxiosInstance;

  return {
    axiosInstance,
    requests,
    respond(data: unknown) {
      queue.push(async () => ({ data }));
    },
    fail(error: Error) {
      queue.push(async () => {
        throw error;
      });
    },
  };
}

function httpError(status: number, data: unknown = {}): AxiosError {
  return new AxiosError(`status ${status}`, "ERR_BAD_REQUEST", undefined, {}, {
    status,
    statusText: String(status),
    data,
    headers: {},
    config: {} as never,
  });
}

const unauthorized = () =>
  httpError(401, {
    errorType: "Invalid_Authentication",
    errorCode: "DH-901",
    errorMessage: "Client ID or user generated access token is invalid or expired.",
  });

function setup() {
  const stub = createAxiosStub();
  const onTokenExpired = jest.fn();
  const tokenProvider = jest
    .fn()
    .mockResolvedValueOnce("token-1")
    .mockResolvedValue("token-2");
  const httpClient = new HttpClient(
    { clientId: "client", tokenProvider, onTokenExpired },
    {
      axiosInstance: stub.axiosInstance,
      rateLimiter: new RateLimiter({ minTime: 0 }),
      circuitBreaker: false,
    },
  );
  return { httpClient, stub, onTokenExpired, tokenProvider };
}

const ENTRY = {
  transactionType: "BUY",
  exchangeSegment: "NSE_FNO",
  productType: "INTRADAY",
  orderType: "LIMIT",
  quantity: 75,
  price: 120,
  securityId: "52175",
  correlationId: "entry-001",
} as const;

describe("401 replay policy — reads", () => {
  it("renews the token and replays a GET exactly once", async () => {
    const { httpClient, stub, onTokenExpired } = setup();
    stub.fail(unauthorized());
    stub.respond([{ orderId: "1" }]);

    const result = await new Orders(httpClient).list();

    expect(result).toEqual([{ orderId: "1" }]);
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
    expect(stub.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "GET /orders",
      "GET /orders",
    ]);
    expect(stub.requests[1]?.headers).toMatchObject({ "access-token": "token-2" });
  });

  it("replays a read-only POST marked safeToRetry (e.g. LTP) once", async () => {
    const { httpClient, stub } = setup();
    stub.fail(unauthorized());
    stub.respond({ data: {} });

    await httpClient.request({
      method: "POST",
      url: "/marketfeed/ltp",
      data: { NSE_EQ: [1333] },
      safeToRetry: true,
    });

    expect(stub.requests).toHaveLength(2);
  });

  it("does not loop when the replayed GET is also rejected", async () => {
    const { httpClient, stub, onTokenExpired } = setup();
    stub.fail(unauthorized());
    stub.fail(unauthorized());

    await expect(new Orders(httpClient).list()).rejects.toBeInstanceOf(
      ApiResponseError,
    );
    expect(stub.requests).toHaveLength(2);
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
  });
});

describe("401 replay policy — trading writes", () => {
  it("renews the token but sends an order POST exactly once", async () => {
    const { httpClient, stub, onTokenExpired, tokenProvider } = setup();
    stub.fail(unauthorized());

    const error = await new Orders(httpClient)
      .place(ENTRY)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error).toMatchObject({ status: 401 });
    expect((error as AuthenticationError).cause).toBeInstanceOf(ApiResponseError);
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
    // Token resolved once for the original request and not again for a replay.
    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(stub.requests.filter((r) => r.method === "POST")).toHaveLength(1);
  });

  it("never loops on repeated 401s across separate placements", async () => {
    const { httpClient, stub, onTokenExpired } = setup();
    stub.fail(unauthorized());
    stub.fail(unauthorized());
    const orders = new Orders(httpClient);

    await expect(orders.place(ENTRY)).rejects.toBeInstanceOf(AuthenticationError);
    expect(stub.requests).toHaveLength(1);

    await expect(
      orders.place({ ...ENTRY, correlationId: "entry-002" }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(stub.requests).toHaveLength(2);
    expect(onTokenExpired).toHaveBeenCalledTimes(2);
  });

  it("still surfaces the 401 as the outcome when token renewal itself fails", async () => {
    const { httpClient, stub, onTokenExpired } = setup();
    const renewalFailure = new Error("TOTP rejected");
    onTokenExpired.mockRejectedValueOnce(renewalFailure);
    stub.fail(unauthorized());

    const error = await new Orders(httpClient)
      .place(ENTRY)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as AuthenticationError).details).toMatchObject({
      tokenRenewalError: renewalFailure,
    });
    expect(stub.requests).toHaveLength(1);
  });

  it("keeps timeout behaviour: one POST, NetworkError, correlationId recoverable", async () => {
    const { httpClient, stub } = setup();
    stub.fail(new AxiosError("timeout", "ECONNABORTED", undefined, {}));
    stub.respond({ orderId: "9", correlationId: "entry-001" });
    const orders = new Orders(httpClient);

    await expect(orders.place(ENTRY)).rejects.toBeInstanceOf(NetworkError);
    await expect(orders.getByCorrelationId("entry-001")).resolves.toMatchObject({
      orderId: "9",
    });
    expect(stub.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "POST /orders",
      "GET /orders/external/entry-001",
    ]);
  });

  it("does not replay an order POST on 5xx", async () => {
    const { httpClient, stub, onTokenExpired } = setup();
    stub.fail(httpError(502));

    await expect(new Orders(httpClient).place(ENTRY)).rejects.toBeInstanceOf(
      ApiResponseError,
    );
    expect(stub.requests).toHaveLength(1);
    expect(onTokenExpired).not.toHaveBeenCalled();
  });

  const writes: Array<[string, (client: HttpClient) => Promise<unknown>]> = [
    ["Orders.modify", (c) => new Orders(c).modify({ orderId: "1", price: 121 })],
    ["Orders.cancel", (c) => new Orders(c).cancel("1")],
    ["Orders.placeSlice", (c) => new Orders(c).placeSlice(ENTRY)],
    [
      "SuperOrders.cancel",
      (c) => new SuperOrders(c).cancel({ orderId: "1", orderLeg: "ENTRY_LEG" }),
    ],
    ["ForeverOrders.cancel", (c) => new ForeverOrders(c).cancel("1")],
    ["ConditionalTriggers.cancel", (c) => new ConditionalTriggers(c).cancel("1")],
    ["GlobalStocks.orders.cancel", (c) => new GlobalStocks(c).orders.cancel("1")],
    ["Positions.exitAll", (c) => new Positions(c).exitAll()],
    ["TraderControls.stopPnlExit", (c) => new TraderControls(c).stopPnlExit()],
    [
      "TraderControls.setKillSwitch",
      (c) => new TraderControls(c).setKillSwitch("ACTIVATE"),
    ],
  ];

  it.each(writes)("%s: renews the token, sends once, raises AuthenticationError", async (_, call) => {
    const { httpClient, stub, onTokenExpired } = setup();
    stub.fail(unauthorized());

    await expect(call(httpClient)).rejects.toBeInstanceOf(AuthenticationError);
    expect(stub.requests).toHaveLength(1);
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
  });

  it("treats an unflagged write (safeToRetry omitted) as non-replayable", async () => {
    const { httpClient, stub } = setup();
    stub.fail(unauthorized());

    await expect(
      httpClient.request({ method: "POST", url: "/orders", data: {} }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(stub.requests).toHaveLength(1);
  });
});
