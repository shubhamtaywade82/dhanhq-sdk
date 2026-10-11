import type { AxiosInstance } from "axios";

import { HttpClient } from "../src/client/HttpClient";
import { RateLimiter } from "../src/client/RateLimiter";
import { SandboxUnsupportedError } from "../src/errors";
import { Alerts } from "../src/resources/Alerts";
import { ScanX } from "../src/resources/ScanX";
import type { DhanClientConfig } from "../src/types/common.types";

function client(config: Partial<DhanClientConfig> = {}) {
  const requests: Array<{ baseURL?: string; method?: string; url?: string; data?: Record<string, unknown> }> = [];
  const axiosInstance = {
    request: jest.fn(async (req) => {
      requests.push(req);
      return { data: { status: "success", data: {} } };
    }),
  } as unknown as AxiosInstance;
  const http = new HttpClient(
    { clientId: "1000000001", token: "t", ...config },
    { axiosInstance, rateLimiter: new RateLimiter({ minTime: 0 }), circuitBreaker: false },
  );
  return { http, requests };
}

describe("ScanX", () => {
  it("POSTs each data endpoint with the documented body", async () => {
    const { http, requests } = client();
    const scanx = new ScanX(http);

    await scanx.companyInfo({ securityId: "1333", exchangeSegment: "NSE_EQ", instrument: "EQUITY", metrics: ["CO"] });
    await scanx.marketMovers({ exchangeSegment: "NSE_FNO", instrument: ["OPTIDX"], category: "HIGHEST_OI", expiry: "2026-10-28", limit: 20 });
    await scanx.newsHeadline({ categories: ["ALL"], limit: 10 });
    await scanx.technical({ securityId: "13", exchangeSegment: "IDX_I", instrument: "INDEX", timeframe: "5", indicators: ["RSI_14"] });

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "POST /data/companyinfo",
      "POST /data/marketmovers",
      "POST /data/newsheadline",
      "POST /data/technical",
    ]);
    expect(requests[2].data).toMatchObject({ dhanClientId: "1000000001", categories: ["ALL"], limit: 10 });
  });

  it("rejects out-of-range limits before sending", async () => {
    const { http, requests } = client();

    await expect(new ScanX(http).newsHeadline({ categories: ["ALL"], limit: 51 })).rejects.toThrow(RangeError);
    expect(requests).toHaveLength(0);
  });

  it("goes to production in hybrid mode", async () => {
    const { http, requests } = client({ mode: "hybrid", sandboxToken: "s", sandboxClientId: "2" });

    await new ScanX(http).technical({ securityId: "13", exchangeSegment: "IDX_I", instrument: "INDEX", timeframe: "D", indicators: ["SMA_20"] });

    expect(requests[0].baseURL).toBeUndefined();
  });
});

describe("Alerts.placeMulti", () => {
  const leg = { sequence: "1", transactionType: "BUY" as const, exchangeSegment: "NSE_EQ" as const, securityId: "1333", quantity: 1 };

  it("POSTs the legs with the client id", async () => {
    const { http, requests } = client();

    await new Alerts(http).placeMulti({ orders: [leg] });

    expect(requests[0]).toMatchObject({ method: "POST", url: "/alerts/multi/orders" });
    expect(requests[0].data).toEqual({ dhanClientId: "1000000001", orders: [leg] });
  });

  it("validates legs before sending", async () => {
    const { http, requests } = client();

    await expect(new Alerts(http).placeMulti({ orders: [] })).rejects.toThrow(RangeError);
    await expect(
      new Alerts(http).placeMulti({ orders: [{ ...leg, correlationId: "x".repeat(31) }] }),
    ).rejects.toThrow(/30 characters/);
    expect(requests).toHaveLength(0);
  });

  it("is refused on the sandbox, never sent to production", async () => {
    const { http, requests } = client({ mode: "hybrid", sandboxToken: "s", sandboxClientId: "2" });

    await expect(new Alerts(http).placeMulti({ orders: [leg] })).rejects.toBeInstanceOf(SandboxUnsupportedError);
    expect(requests).toHaveLength(0);
  });
});
