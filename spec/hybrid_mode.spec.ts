import type { AxiosInstance } from "axios";

import { DhanClient } from "../src/client/DhanClient";
import {
  environmentFor,
  parseMode,
  routeClassFor,
  sandboxSupports,
} from "../src/client/Environment";
import { HttpClient } from "../src/client/HttpClient";
import { RateLimiter } from "../src/client/RateLimiter";
import { OpenAPI } from "../src/generated";
import { AuthenticationError, SandboxUnsupportedError } from "../src/errors";
import { MarketFeed } from "../src/resources/MarketFeed";
import { Orders } from "../src/resources/Orders";
import { SuperOrders } from "../src/resources/SuperOrders";
import type { DhanClientConfig } from "../src/types/common.types";

type Captured = {
  baseURL?: string;
  method?: string;
  url?: string;
  data?: Record<string, unknown>;
  headers?: Record<string, string>;
};

function stubAxios() {
  const requests: Captured[] = [];
  const axiosInstance = {
    request: jest.fn(async (config: Captured) => {
      requests.push(config);
      return { data: { orderId: "1", orderStatus: "PENDING", data: {} } };
    }),
  } as unknown as AxiosInstance;
  return { axiosInstance, requests };
}

function httpClient(config: Partial<DhanClientConfig>) {
  const stub = stubAxios();
  const client = new HttpClient(
    { clientId: "1000000001", token: "live-token", ...config },
    {
      axiosInstance: stub.axiosInstance,
      rateLimiter: new RateLimiter({ minTime: 0 }),
      circuitBreaker: false,
    },
  );
  return { client, requests: stub.requests };
}

const order = {
  transactionType: "BUY",
  exchangeSegment: "NSE_EQ",
  productType: "CNC",
  orderType: "LIMIT",
  validity: "DAY",
  securityId: "1333",
  quantity: 1,
  price: 100,
} as const;

const hybrid: Partial<DhanClientConfig> = {
  mode: "hybrid",
  sandboxToken: "sandbox-token",
  sandboxClientId: "2000000002",
};

describe("Environment routing", () => {
  it("classifies paths", () => {
    expect(routeClassFor("/marketfeed/ltp")).toBe("market_data");
    expect(routeClassFor("/optionchain/expirylist")).toBe("market_data");
    expect(routeClassFor("/charts/intraday")).toBe("market_data");
    expect(routeClassFor("/instrument/NSE_EQ")).toBe("public");
    expect(routeClassFor("/globalstocks/orders")).toBe("global_stocks");
    expect(routeClassFor("/orders")).toBe("trading");
    expect(routeClassFor("/v2/orders?x=1")).toBe("trading");
  });

  it("splits data and trading in hybrid mode", () => {
    expect(environmentFor("hybrid", "/marketfeed/ltp")).toBe("live");
    expect(environmentFor("hybrid", "/globalstocks/orders")).toBe("live");
    expect(environmentFor("hybrid", "/orders")).toBe("sandbox");
    expect(environmentFor("sandbox", "/marketfeed/ltp")).toBe("sandbox");
    expect(environmentFor("sandbox", "/instrument/NSE_EQ")).toBe("live");
    expect(environmentFor("live", "/orders")).toBe("live");
  });

  it("allows only operations the sandbox serves", () => {
    expect(sandboxSupports("POST", "/orders")).toBe(true);
    expect(sandboxSupports("DELETE", "/orders/123")).toBe(true);
    expect(sandboxSupports("GET", "/trades/2024-01-01/2024-01-02/0")).toBe(true);
    expect(sandboxSupports("POST", "/super/orders")).toBe(false);
    expect(sandboxSupports("GET", "/killswitch")).toBe(false);
    expect(sandboxSupports("DELETE", "/positions")).toBe(false);
    expect(sandboxSupports("POST", "/optionchain")).toBe(false);
  });

  it("parses DHAN_MODE strictly", () => {
    expect(parseMode(undefined)).toBe("live");
    expect(parseMode(" Hybrid ")).toBe("hybrid");
    expect(() => parseMode("paper")).toThrow(/Unknown DHAN_MODE/);
  });
});

describe("HttpClient in hybrid mode", () => {
  it("sends orders to the sandbox with sandbox credentials, header and body", async () => {
    const { client, requests } = httpClient(hybrid);

    await new Orders(client).place(order);

    expect(requests[0].baseURL).toBe("https://sandbox.dhan.co/v2");
    expect(requests[0].headers).toMatchObject({ "access-token": "sandbox-token", "client-id": "2000000002" });
    expect(requests[0].data?.dhanClientId).toBe("2000000002");
  });

  it("sends market data to production with production credentials", async () => {
    const { client, requests } = httpClient(hybrid);

    await new MarketFeed(client).ltp({ NSE_EQ: ["1333"] } as never);

    expect(requests[0].baseURL).toBeUndefined(); // the production instance's own base URL
    expect(requests[0].headers).toMatchObject({ "access-token": "live-token", "client-id": "1000000001" });
  });

  it("fails before any I/O without sandbox credentials", async () => {
    const { client, requests } = httpClient({ mode: "hybrid" });

    await expect(new Orders(client).place(order)).rejects.toThrow(AuthenticationError);
    expect(requests).toHaveLength(0);
  });

  it("refuses sandbox-unsupported endpoints and never falls back to production", async () => {
    const { client, requests } = httpClient(hybrid);

    await expect(
      new SuperOrders(client).place({
        ...order,
        productType: "INTRADAY",
        targetPrice: 110,
        stopLossPrice: 95,
        trailingJump: 0,
      } as never),
    ).rejects.toBeInstanceOf(SandboxUnsupportedError);
    expect(requests).toHaveLength(0);
  });

  it("falls back to the primary credentials in full sandbox mode", async () => {
    const { client, requests } = httpClient({ mode: "sandbox" });

    await new Orders(client).place(order);

    expect(requests[0].baseURL).toBe("https://sandbox.dhan.co/v2");
    expect(requests[0].headers).toMatchObject({ "access-token": "live-token", "client-id": "1000000001" });
  });

  it("leaves live mode untouched", async () => {
    const { client, requests } = httpClient({});

    await new Orders(client).place(order);

    expect(requests[0].baseURL).toBeUndefined();
    expect(requests[0].headers?.["access-token"]).toBe("live-token");
  });
});

describe("DhanClient", () => {
  it("reads mode and sandbox credentials from the environment", () => {
    const client = DhanClient.fromEnv({
      DHAN_CLIENT_ID: "1",
      DHAN_ACCESS_TOKEN: "t",
      DHAN_MODE: "hybrid",
      DHAN_SANDBOX_CLIENT_ID: "2",
      DHAN_SANDBOX_ACCESS_TOKEN: "s",
    });

    expect(client.getConfig()).toMatchObject({ mode: "hybrid", sandboxClientId: "2", sandboxToken: "s" });
  });

  it("points the raw generated client at the sandbox outside live mode", () => {
    new DhanClient({ clientId: "1", token: "live-token", ...hybrid });
    expect(OpenAPI.BASE).toBe("https://sandbox.dhan.co/v2");
    expect(OpenAPI.HEADERS).toEqual({ "access-token": "sandbox-token" });

    new DhanClient({ clientId: "1", token: "live-token" });
    expect(OpenAPI.BASE).toBe("https://api.dhan.co/v2");
  });
});

describe("WebSockets per mode", () => {
  const blockedBy = (socket: object) => (socket as { blockedBy?: Error }).blockedBy;

  it("refuses every socket in sandbox mode, before any connection attempt", async () => {
    const client = new DhanClient({ clientId: "1", token: "sandbox-token", mode: "sandbox" });
    const depth = client.ws.enableDepth("twenty");

    for (const socket of [client.ws.market, client.ws.orders, depth]) {
      await expect(socket.connect()).rejects.toBeInstanceOf(SandboxUnsupportedError);
    }
    await expect(client.ws.connect()).rejects.toThrow(/Use mode "hybrid"/);
    expect(client.ws.market.isConnected).toBe(false);
  });

  it.each(["hybrid", "live"] as const)("leaves sockets usable in %s mode", (mode) => {
    const client = new DhanClient({ clientId: "1", token: "live-token", ...hybrid, mode });

    expect(blockedBy(client.ws.market)).toBeUndefined();
    expect(blockedBy(client.ws.orders)).toBeUndefined();
    expect(blockedBy(client.ws.enableDepth())).toBeUndefined();
  });
});
