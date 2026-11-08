import type { AxiosInstance } from "axios";

import { HttpClient } from "../src/client/HttpClient";
import { RateLimiter } from "../src/client/RateLimiter";
import { ExpiredOptionsData } from "../src/resources/ExpiredOptionsData";

function createClient(response: unknown = {
  status: "success",
  data: {
    ce: {
      timestamp: [1794043800],
      open: [100],
      high: [110],
      low: [95],
      close: [108],
      volume: [1200],
      oi: [5000],
      iv: [18.5],
      strike: [24500],
      spot: [24900],
    },
    pe: null,
  },
}) {
  const requests: Array<{ method?: string; url?: string; data?: Record<string, unknown> }> = [];
  const axiosInstance = {
    request: jest.fn(async (request) => {
      requests.push(request);
      return { data: response };
    }),
  } as unknown as AxiosInstance;

  const http = new HttpClient(
    { clientId: "1000000001", token: "test-token" },
    {
      axiosInstance,
      rateLimiter: new RateLimiter({ minTime: 0 }),
      circuitBreaker: false,
    },
  );

  return { client: new ExpiredOptionsData(http), requests };
}

const baseRequest = {
  securityId: 13,
  exchangeSegment: "NSE_FNO",
  instrument: "OPTIDX" as const,
  expiryFlag: "WEEK" as const,
  expiryCode: 1,
  strike: "ATM",
  drvOptionType: "CALL" as const,
  interval: "1" as const,
  requiredData: ["open", "high", "low", "close", "iv", "volume", "strike", "oi", "spot"] as const,
  fromDate: "2026-11-02",
  toDate: "2026-11-07",
  autoAdjustDates: false,
};

describe("ExpiredOptionsData research contract", () => {
  it("preserves Dhan's nested CE/PE timestamped series response", async () => {
    const { client } = createClient();

    const response = await client.fetch(baseRequest);

    expect(response.data?.ce?.timestamp).toEqual([1794043800]);
    expect(response.data?.ce?.iv).toEqual([18.5]);
    expect(response.data?.ce?.spot).toEqual([24900]);
    expect(response.data?.pe).toBeNull();
  });

  it("sends the documented rolling-options fields without SDK-only aliases", async () => {
    const { client, requests } = createClient();

    await client.fetch(baseRequest);

    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("/charts/rollingoption");
    expect(requests[0].data).toEqual({
      securityId: 13,
      exchangeSegment: "NSE_FNO",
      instrument: "OPTIDX",
      expiryFlag: "WEEK",
      expiryCode: 1,
      strike: "ATM",
      drvOptionType: "CALL",
      interval: "1",
      requiredData: ["open", "high", "low", "close", "iv", "volume", "strike", "oi", "spot"],
      fromDate: "2026-11-02",
      toDate: "2026-11-07",
    });
  });

  it("normalizes the legacy WEEKLY alias to Dhan's WEEK enum", async () => {
    const { client, requests } = createClient();

    await client.fetch({ ...baseRequest, expiryFlag: "WEEKLY" });

    expect(requests[0].data?.expiryFlag).toBe("WEEK");
  });

  it("rejects a request longer than Dhan's 30-day maximum before making a request", async () => {
    const { client, requests } = createClient();

    await expect(
      client.fetch({
        ...baseRequest,
        fromDate: "2026-09-01",
        toDate: "2026-10-03",
      }),
    ).rejects.toThrow();

    expect(requests).toHaveLength(0);
  });

  it("rejects unsupported requested fields before making a request", async () => {
    const { client, requests } = createClient();

    await expect(
      client.fetch({
        ...baseRequest,
        requiredData: ["close", "bid", "ask"] as never,
      }),
    ).rejects.toThrow();

    expect(requests).toHaveLength(0);
  });
});
