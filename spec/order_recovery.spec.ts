import { AxiosError, type AxiosInstance } from "axios";

import { HttpClient } from "../src/client/HttpClient";
import { RateLimiter } from "../src/client/RateLimiter";
import { NetworkError } from "../src/errors";
import { Orders } from "../src/resources/Orders";

/**
 * `correlationId` is a client-side tag Dhan stores against the order so it can
 * be looked up later. It is NOT a broker-side idempotency key: a second POST
 * with the same `correlationId` is a second order. After an uncertain write the
 * only safe move is to look the order up by `correlationId`, never to replay.
 */

type Responder = () => Promise<{ data: unknown }>;

function createAxiosStub() {
  const requests: Array<{ method?: string; url?: string; data?: unknown }> = [];
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

/** A request that went out but never got a response: outcome unknown. */
function timeoutError(): AxiosError {
  return new AxiosError(
    "timeout of 5000ms exceeded",
    "ECONNABORTED",
    undefined,
    {},
  );
}

function createOrders() {
  const stub = createAxiosStub();
  const httpClient = new HttpClient(
    { clientId: "client", token: "token" },
    {
      axiosInstance: stub.axiosInstance,
      rateLimiter: new RateLimiter({ minTime: 0 }),
      circuitBreaker: false,
    },
  );
  return { orders: new Orders(httpClient), stub };
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

describe("order recovery via correlationId", () => {
  it("surfaces a placement timeout without replaying the POST", async () => {
    const { orders, stub } = createOrders();
    stub.fail(timeoutError());

    await expect(orders.place(ENTRY)).rejects.toBeInstanceOf(NetworkError);

    const posts = stub.requests.filter((r) => r.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      url: "/orders",
      data: expect.objectContaining({ correlationId: "entry-001" }),
    });
  });

  it("does not replay the POST on a 5xx either", async () => {
    const { orders, stub } = createOrders();
    stub.fail(
      new AxiosError("Bad Gateway", "ERR_BAD_RESPONSE", undefined, {}, {
        status: 502,
        statusText: "Bad Gateway",
        data: {},
        headers: {},
        config: {} as never,
      }),
    );

    await expect(orders.place(ENTRY)).rejects.toThrow();
    expect(stub.requests.filter((r) => r.method === "POST")).toHaveLength(1);
  });

  it("resolves an uncertain write by GET-ing the order by correlationId", async () => {
    const { orders, stub } = createOrders();
    stub.fail(timeoutError());
    stub.respond({
      orderId: "112111182198",
      correlationId: "entry-001",
      orderStatus: "PENDING",
    });

    const placed = await orders.place(ENTRY).catch((error: unknown) => error);
    expect(placed).toBeInstanceOf(NetworkError);

    const existing = await orders.getByCorrelationId(ENTRY.correlationId);

    expect(existing).toMatchObject({
      orderId: "112111182198",
      correlationId: "entry-001",
    });
    expect(stub.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "POST /orders",
      "GET /orders/external/entry-001",
    ]);
  });

  it("auto-generates a correlationId when none is supplied, so recovery is always possible", async () => {
    const { orders, stub } = createOrders();
    stub.respond({ orderId: "1", orderStatus: "TRANSIT" });

    const { correlationId, data } = await orders.place({
      ...ENTRY,
      correlationId: undefined,
    });

    expect(correlationId).toEqual(expect.any(String));
    expect(correlationId.length).toBeGreaterThan(0);
    expect(data.correlationId).toBe(correlationId);
    expect(stub.requests[0]?.data).toMatchObject({ correlationId });
  });
});
