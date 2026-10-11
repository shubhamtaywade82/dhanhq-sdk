import { LTPStore, MarketDepthWS, MarketFeedWS, parseMarketDepthPacket, parseMarketFeedPacket } from "../src";
import { DhanError } from "../src/errors";
import type { MarketDepthDisconnectEvent, WebSocketLike } from "../src/types/ws.types";

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

async function connected<T extends MarketFeedWS | MarketDepthWS>(build: (socket: FakeSocket) => T) {
  const socket = new FakeSocket();
  const ws = build(socket);
  await ws.connect();
  socket.emit("open");
  return { socket, ws, messages: () => socket.sent.map((m) => JSON.parse(m)) };
}

const factory = (socket: FakeSocket) => () => socket as unknown as WebSocketLike;
const nifty = { exchangeSegment: "IDX_I", securityId: "13" };
const reliance = { exchangeSegment: "NSE_EQ", securityId: "2885" };
const hdfc = { exchangeSegment: "NSE_EQ", securityId: "1333" };

describe("MarketFeedWS unsubscribe", () => {
  it.each([
    ["ticker", 15, 16],
    ["quote", 17, 18],
    ["full", 21, 22],
  ] as const)("sends the %s unsubscribe code to the server", async (mode, sub, unsub) => {
    const { ws, messages } = await connected((socket) =>
      new MarketFeedWS({ token: "t", clientId: "c", mode, webSocketFactory: factory(socket) }, new LTPStore()),
    );

    ws.subscribe([nifty]);
    ws.unsubscribe([nifty]);

    expect(messages().map((m) => m.RequestCode)).toEqual([sub, unsub]);
    expect(messages()[1].InstrumentList).toEqual([{ ExchangeSegment: "IDX_I", SecurityId: "13" }]);
    expect(ws.getSubscriptions()).toHaveLength(0);
    ws.disconnect();
  });
});

describe("MarketDepthWS", () => {
  const depth = (mode: "twenty" | "twohundred") =>
    connected((socket) => new MarketDepthWS({ token: "t", clientId: "c", mode, webSocketFactory: factory(socket) }));

  it("sends unsubscribe code 24 to the server", async () => {
    const { ws, messages } = await depth("twenty");

    ws.subscribe([reliance]);
    ws.unsubscribe([reliance]);

    expect(messages()[1]).toEqual({
      RequestCode: 24,
      InstrumentCount: 1,
      InstrumentList: [{ ExchangeSegment: "NSE_EQ", SecurityId: "2885" }],
    });
    ws.disconnect();
  });

  it("refuses more than 50 instruments on a 20-level connection", async () => {
    const { ws } = await depth("twenty");
    const many = Array.from({ length: 51 }, (_, i) => ({ exchangeSegment: "NSE_EQ", securityId: String(i + 1) }));

    expect(() => ws.subscribe(many)).toThrow(DhanError);
    expect(ws.getSubscriptions()).toHaveLength(0);
    ws.disconnect();
  });

  it("allows exactly one instrument on a 200-level connection, sent flat", async () => {
    const { ws, messages } = await depth("twohundred");

    ws.subscribe([reliance]);
    expect(() => ws.subscribe([hdfc])).toThrow(/200-level depth allows 1/);

    expect(messages()).toEqual([{ RequestCode: 23, ExchangeSegment: "NSE_EQ", SecurityId: "2885" }]);
    ws.disconnect();
  });

  it("emits server disconnect frames", async () => {
    const { ws, socket } = await depth("twenty");
    const disconnects: MarketDepthDisconnectEvent[] = [];
    ws.on("disconnect", (event) => disconnects.push(event));

    const frame = Buffer.alloc(14);
    frame.writeInt16LE(14, 0);
    frame.writeUInt8(50, 2);
    frame.writeUInt8(1, 3);
    frame.writeInt32LE(2885, 4);
    frame.writeInt16LE(805, 12);
    socket.emit("message", frame);

    expect(disconnects).toEqual([
      { type: "depth-disconnect", securityId: "2885", exchangeSegment: "NSE_EQ", reasonCode: 805 },
    ]);
    ws.disconnect();
  });
});

describe("segment codes in packet headers", () => {
  function depthFrame(segmentCode: number) {
    const frame = Buffer.alloc(12 + 16);
    frame.writeInt16LE(frame.length, 0);
    frame.writeUInt8(41, 2);
    frame.writeUInt8(segmentCode, 3);
    frame.writeInt32LE(99, 4);
    frame.writeDoubleLE(100.5, 12);
    frame.writeUInt32LE(10, 20);
    frame.writeUInt32LE(1, 24);
    return frame;
  }

  it.each([
    [0, "IDX_I"],
    [1, "NSE_EQ"],
    [2, "NSE_FNO"],
    [3, "NSE_CURRENCY"],
    [4, "BSE_EQ"],
    [5, "MCX_COMM"],
    [7, "BSE_CURRENCY"],
    [8, "BSE_FNO"],
  ])("maps code %i to %s per the annexure", (code, segment) => {
    expect(parseMarketDepthPacket(depthFrame(code), "twenty")[0].exchangeSegment).toBe(segment);
  });

  it("decodes a market-status packet (code 7) instead of dropping it", () => {
    const packet = Buffer.alloc(8);
    packet.writeUInt8(7, 0);
    packet.writeInt16LE(8, 1);

    expect(parseMarketFeedPacket(packet, [])).toMatchObject({ type: "market-status" });
  });
});

describe("BaseWS.block", () => {
  it("rejects connect without opening a socket or scheduling a reconnect", async () => {
    const factory = jest.fn();
    const ws = new MarketFeedWS({ token: "t", clientId: "c", webSocketFactory: factory }, new LTPStore());
    const reason = new DhanError("no sockets here", { code: "TEST" });
    ws.block(reason);

    await expect(ws.connect()).rejects.toBe(reason);
    expect(factory).not.toHaveBeenCalled();
    expect((ws as unknown as { reconnectTimer?: unknown }).reconnectTimer).toBeUndefined();
  });
});
