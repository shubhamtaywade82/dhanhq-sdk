import type { AxiosInstance } from "axios";

import { Charts, LTPStore, MarketDepthWS, MarketFeedWS, OptionChain, Orders, ScanX, WebSocketManager } from "../src";
import { HttpClient } from "../src/client/HttpClient";
import type { RateLimiter } from "../src/client/RateLimiter";
import { DATA_SUBSCRIPTION_TIERS, DataApiErrorCode, FEED_TERMINAL_DISCONNECT_CODES, RATE_LIMITS } from "../src/constants";
import {
  ApiResponseError,
  DataApiSubscriptionError,
  FeedDisconnectError,
  RateLimitError,
  isTerminalFeedDisconnect,
} from "../src/errors";
import type { WebSocketLike } from "../src/types/ws.types";

const DH_902 = { errorType: "Invalid_Access", errorCode: "DH-902", errorMessage: "Subscribe to Data APIs" };

/** An axios-shaped rejection, as the HTTP client's normalizer expects. */
function axiosFailure(status: number, data: Record<string, unknown>): never {
  return {
    isAxiosError: true,
    name: "AxiosError",
    message: "request failed",
    response: { status, data, headers: {} },
  } as never;
}

function httpFailingWith(failure: unknown): HttpClient {
  const axiosInstance = {
    request: jest.fn(async () => {
      throw failure;
    }),
  } as unknown as AxiosInstance;
  return new HttpClient({ token: "token", clientId: "client-id", circuitBreaker: false }, { axiosInstance });
}

/** Rate limiter that records which tier each request was scheduled on. */
function tierSpy() {
  const tiers: string[] = [];
  const limiter = {
    scheduleRead: <T>(task: () => Promise<T>) => task(),
    scheduleWrite: <T>(task: () => Promise<T>) => task(),
    scheduleTier: <T>(tier: string, _isWrite: boolean, task: () => Promise<T>) => {
      tiers.push(tier);
      return task();
    },
  } as unknown as RateLimiter;
  const axiosInstance = { request: jest.fn(async () => ({ data: {} })) } as unknown as AxiosInstance;
  return { tiers, httpClient: new HttpClient({ token: "token", clientId: "client-id", circuitBreaker: false }, { axiosInstance, rateLimiter: limiter }) };
}

class FakeSocket {
  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  public readonly sent: string[] = [];

  public on(event: string, listener: (...args: unknown[]) => void): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
  }

  public send(data: string | Buffer): void {
    this.sent.push(typeof data === "string" ? data : data.toString("hex"));
  }

  public close(): void {}

  public emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

/** Live Market Feed disconnect packet: 8-byte header, code 50, int16 reason at offset 8. */
function feedDisconnectFrame(reasonCode: number): Buffer {
  const frame = Buffer.alloc(10);
  frame.writeUInt8(50, 0);
  frame.writeInt16LE(10, 1);
  frame.writeUInt8(1, 3);
  frame.writeInt32LE(1333, 4);
  frame.writeInt16LE(reasonCode, 8);
  return frame;
}

/** Full Market Depth disconnect packet: 12-byte header, code 50 at byte 2, int16 reason at offset 12. */
function depthDisconnectFrame(reasonCode: number): Buffer {
  const frame = Buffer.alloc(14);
  frame.writeInt16LE(14, 0);
  frame.writeUInt8(50, 2);
  frame.writeUInt8(1, 3);
  frame.writeInt32LE(2885, 4);
  frame.writeInt16LE(reasonCode, 12);
  return frame;
}

const nifty = { exchangeSegment: "NSE_EQ", securityId: "1333" };

describe("constants pinned to the documented rate-limit table", () => {
  it("uses 7,000/day for Order APIs and 1,00,000/day for Data APIs", () => {
    expect(RATE_LIMITS.order_api.perDay).toBe(7_000);
    expect(RATE_LIMITS.data_api.perDay).toBe(100_000);
  });

  it("treats 805-810 and 804 as terminal feed disconnects, and 800 as transient", () => {
    expect(FEED_TERMINAL_DISCONNECT_CODES).toEqual([804, 805, 806, 807, 808, 809, 810]);
    expect(isTerminalFeedDisconnect(806)).toBe(true);
    expect(isTerminalFeedDisconnect(800)).toBe(false);
    expect(DataApiErrorCode[806]).toBe("DATA_API_NOT_SUBSCRIBED");
  });

  it("names the three data-plan tiers", () => {
    expect([...DATA_SUBSCRIPTION_TIERS].sort()).toEqual(["data_api", "option_chain", "quote_api"]);
  });
});

describe("DH-902 on data endpoints means no Data API plan", () => {
  it.each([
    ["ScanX.technical", (client: HttpClient) =>
      new ScanX(client).technical({ securityId: "13", exchangeSegment: "IDX_I", instrument: "INDEX", timeframe: "D", indicators: ["RSI_14"] })],
    ["OptionChain.fetch", (client: HttpClient) =>
      new OptionChain(client).fetch({ underlyingScrip: 13, underlyingSeg: "IDX_I", expiry: "2026-08-28" })],
    ["Charts.option", (client: HttpClient) => new Charts(client).option({} as never)],
  ])("%s raises DataApiSubscriptionError", async (_name, call) => {
    const error = await call(httpFailingWith(axiosFailure(400, { ...DH_902 }))).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataApiSubscriptionError);
    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error).toMatchObject({ code: "DATA_API_NOT_SUBSCRIBED", status: 400, errorCode: "DH-902" });
    expect((error as Error).message).toContain("Data API subscription required");
    expect((error as Error).message).toContain("Subscribe to Data APIs");
  });

  it("keeps DH-902 on an order endpoint as a plain ApiResponseError", async () => {
    const error = await new Orders(httpFailingWith(axiosFailure(400, { ...DH_902 })))
      .getById("123")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error).not.toBeInstanceOf(DataApiSubscriptionError);
    expect(error).toMatchObject({ errorCode: "DH-902", code: "API_RESPONSE_ERROR" });
  });

  it("still classifies DH-904 on a data endpoint as RateLimitError", async () => {
    const error = await new ScanX(httpFailingWith(axiosFailure(400, { errorCode: "DH-904" })))
      .technical({ securityId: "13", exchangeSegment: "IDX_I", instrument: "INDEX", timeframe: "D", indicators: [] })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
  });
});

describe("data endpoints run on the data_api tier", () => {
  it("schedules ScanX, option chain and chart calls on their tiers", async () => {
    const { tiers, httpClient } = tierSpy();

    await new ScanX(httpClient).technical({ securityId: "13", exchangeSegment: "IDX_I", instrument: "INDEX", timeframe: "D", indicators: [] });
    await new Charts(httpClient).option({} as never);
    await new Charts(httpClient).intraday({
      exchangeSegment: "NSE_EQ",
      instrument: "EQUITY",
      interval: "1",
      securityId: "1333",
      fromDate: "2026-01-01",
      toDate: "2026-01-01",
      autoAdjustDates: false,
    });

    expect(tiers).toEqual(["data_api", "data_api", "data_api"]);
  });
});

describe("terminal feed disconnects halt the socket", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function socketFactory(sockets: FakeSocket[]) {
    return () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocketLike;
    };
  }

  it("FeedDisconnectError carries the symbolic reason", () => {
    const error = new FeedDisconnectError(806);

    expect(error).toMatchObject({ name: "FeedDisconnectError", code: "FEED_DISCONNECTED_TERMINAL", reasonCode: 806, reason: "DATA_API_NOT_SUBSCRIBED" });
    expect(new FeedDisconnectError(999).reason).toBe("UNKNOWN");
  });

  it("does not reconnect market feed after 806, even when the server accepts and closes again", async () => {
    const sockets: FakeSocket[] = [];
    const feed = new MarketFeedWS(
      { token: "t", clientId: "c", mode: "full", webSocketFactory: socketFactory(sockets) },
      new LTPStore(),
    );
    const disconnects: Array<{ reasonCode?: number }> = [];
    feed.on("disconnect", (event: { reasonCode?: number }) => disconnects.push(event));

    await feed.connect();
    sockets[0].emit("open");
    feed.subscribe([nifty]);
    sockets[0].emit("message", feedDisconnectFrame(806));
    sockets[0].emit("close");
    await jest.advanceTimersByTimeAsync(5 * 60_000);

    expect(sockets).toHaveLength(1);
    expect(disconnects).toEqual([expect.objectContaining({ reasonCode: 806 })]);
    await expect(feed.connect()).rejects.toMatchObject({ name: "FeedDisconnectError", reasonCode: 806 });
    expect(sockets).toHaveLength(1);
    feed.disconnect();
  });

  it("still reconnects market feed after a transient disconnect (800) and re-sends subscriptions", async () => {
    const sockets: FakeSocket[] = [];
    const feed = new MarketFeedWS(
      { token: "t", clientId: "c", mode: "full", webSocketFactory: socketFactory(sockets) },
      new LTPStore(),
    );

    await feed.connect();
    sockets[0].emit("open");
    feed.subscribe([nifty]);
    sockets[0].emit("message", feedDisconnectFrame(800));
    sockets[0].emit("close");
    await jest.advanceTimersByTimeAsync(60_000);

    expect(sockets).toHaveLength(2);
    sockets[1].emit("open");
    expect(sockets[1].sent.map((m) => JSON.parse(m))).toEqual([
      expect.objectContaining({ InstrumentList: [{ ExchangeSegment: "NSE_EQ", SecurityId: "1333" }] }),
    ]);
    feed.disconnect();
  });

  it("halts the depth feed on a terminal 805 frame", async () => {
    const sockets: FakeSocket[] = [];
    const depth = new MarketDepthWS({ token: "t", clientId: "c", mode: "twenty", webSocketFactory: socketFactory(sockets) });

    await depth.connect();
    sockets[0].emit("open");
    sockets[0].emit("message", depthDisconnectFrame(805));
    sockets[0].emit("close");
    await jest.advanceTimersByTimeAsync(5 * 60_000);

    expect(sockets).toHaveLength(1);
    await expect(depth.connect()).rejects.toMatchObject({ reasonCode: 805 });
  });

  describe("WebSocketManager", () => {
    function build() {
      const market: FakeSocket[] = [];
      const orders: FakeSocket[] = [];
      const manager = new WebSocketManager({
        token: "t",
        clientId: "c",
        marketSocketFactory: socketFactory(market),
        orderSocketFactory: socketFactory(orders),
      });
      return { manager, market, orders };
    }

    it("reports a terminal disconnect through onFatalError and does not reconnect", async () => {
      const { manager, market, orders } = build();
      const fatal: FeedDisconnectError[] = [];
      manager.onFatalError((error) => fatal.push(error));

      await manager.connect();
      market[0].emit("open");
      manager.subscribe([nifty]);
      market[0].emit("message", feedDisconnectFrame(806));
      market[0].emit("close");
      await jest.advanceTimersByTimeAsync(5 * 60_000);

      expect(market).toHaveLength(1);
      expect(orders).toHaveLength(1);
      expect(fatal).toHaveLength(1);
      expect(fatal[0]).toMatchObject({ reasonCode: 806, reason: "DATA_API_NOT_SUBSCRIBED" });
    });

    it("reconnects exactly one market socket and leaves the order socket alone on a transient disconnect", async () => {
      const { manager, market, orders } = build();
      await manager.connect();
      market[0].emit("open");
      manager.subscribe([nifty]);
      market[0].emit("message", feedDisconnectFrame(800));
      market[0].emit("close");
      await jest.advanceTimersByTimeAsync(60_000);

      // A second market socket from the base class's own close-reconnect, or
      // an order socket from DhanWS.connect(), would show up here as extra sockets.
      expect(market).toHaveLength(2);
      expect(orders).toHaveLength(1);

      market[1].emit("open");
      expect(market[1].sent.map((m) => JSON.parse(m))).toEqual([
        expect.objectContaining({ InstrumentList: [{ ExchangeSegment: "NSE_EQ", SecurityId: "1333" }] }),
      ]);
      manager.disconnect();
    });
  });
});
