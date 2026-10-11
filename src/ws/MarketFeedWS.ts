import WebSocket from "ws";

import { AuthResolver } from "../auth";
import type { InstrumentSubscription } from "../types/common.types";
import type {
  MarketFeedMode,
  MarketFeedWSOptions,
  StoredSubscription,
  WebSocketLike,
} from "../types/ws.types";
import type { Logger } from "../types/logger.types";
import { BaseWS } from "./BaseWS";
import { parseMarketFeedPacket } from "./parsers/marketFeed";
import { splitPackets } from "./parsers/packetSplitter";
import { LTPStore } from "./store/LTPStore";

const REQUEST_CODE_BY_MODE: Record<MarketFeedMode, number> = {
  ticker: 15,
  quote: 17,
  full: 21,
};

const UNSUBSCRIBE_CODE_BY_MODE: Record<MarketFeedMode, number> = {
  ticker: 16,
  quote: 18,
  full: 22,
};

export interface MarketFeedWSOptionsWithLogger extends MarketFeedWSOptions {
  logger?: Logger;
}

export class MarketFeedWS extends BaseWS {
  private readonly subscriptions = new Map<string, StoredSubscription>();
  private readonly ltpStore: LTPStore;
  private readonly mode: MarketFeedMode;

  constructor(options: MarketFeedWSOptionsWithLogger, ltpStore: LTPStore) {
    const authResolver = new AuthResolver({
      token: options.token,
      tokenProvider: options.tokenProvider,
      clientId: options.clientId,
    });

    super(
      async () =>
        options.url ??
        buildMarketFeedUrl(
          await authResolver.resolveAccessToken(),
          options.clientId,
        ),
      options.reconnectDelayMs ?? 1000,
      options.webSocketFactory ?? defaultFactory,
      options.maxReconnectDelayMs,
      options.maxReconnectAttempts,
      options.logger,
    );
    this.ltpStore = ltpStore;
    this.mode = options.mode ?? "full";
  }

  public subscribe(instruments: InstrumentSubscription[]): void {
    for (const instrument of instruments) {
      this.subscriptions.set(this.subscriptionKey(instrument), {
        ...instrument,
        mode: this.mode,
      });
    }

    if (this.isConnected) {
      this.sendSubscription(instruments);
    }
  }

  /**
   * Stops the feed for these instruments: tells the server (RequestCode
   * 16/18/22 for ticker/quote/full) and forgets them locally. Never sends 12 —
   * that is the whole-connection Disconnect Feed frame.
   */
  public unsubscribe(instruments: InstrumentSubscription[]): void {
    for (const instrument of instruments) {
      this.subscriptions.delete(this.subscriptionKey(instrument));
      this.ltpStore.delete(this.subscriptionKey(instrument));
    }

    if (this.isConnected && instruments.length > 0) {
      this.sendInstruments(UNSUBSCRIBE_CODE_BY_MODE[this.mode], instruments);
    }
  }

  public getSubscriptions(): StoredSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  protected onOpen(): void {
    this.emit("open");
    const subscriptions = this.getSubscriptions();

    if (subscriptions.length > 0) {
      this.sendSubscription(subscriptions);
    }
  }

  protected onMessage(data: unknown): void {
    const buffer = toBuffer(data);
    if (!buffer) {
      return;
    }

    const packets = splitPackets(buffer);
    for (const packet of packets) {
      const parsed = parseMarketFeedPacket(packet, this.getSubscriptions());
      if (!parsed) {
        continue;
      }

      if ("ltp" in parsed && typeof parsed.ltp === "number") {
        this.ltpStore.set(
          this.subscriptionKey({
            securityId: parsed.securityId,
            exchangeSegment: parsed.exchangeSegment,
          }),
          parsed.ltp,
        );
      }

      if (parsed.type === "disconnect") {
        this.emit("disconnect", parsed);
      }

      this.emit("tick", parsed);
    }
  }

  protected onClose(): void {
    this.emit("close");
  }

  private sendSubscription(instruments: InstrumentSubscription[]): void {
    this.sendInstruments(REQUEST_CODE_BY_MODE[this.mode], instruments);
  }

  /** Docs: at most 100 instruments per JSON message. */
  private sendInstruments(requestCode: number, instruments: InstrumentSubscription[]): void {
    const batchSize = 100;

    for (let index = 0; index < instruments.length; index += batchSize) {
      const batch = instruments.slice(index, index + batchSize);
      this.send(
        JSON.stringify({
          RequestCode: requestCode,
          InstrumentCount: batch.length,
          InstrumentList: batch.map((instrument) => ({
            ExchangeSegment: instrument.exchangeSegment,
            SecurityId: instrument.securityId,
          })),
        }),
      );
    }
  }

  private subscriptionKey(instrument: InstrumentSubscription): string {
    return `${instrument.exchangeSegment}:${instrument.securityId}`;
  }
}

function buildMarketFeedUrl(token: string, clientId: string): string {
  return `wss://api-feed.dhan.co?version=2&token=${encodeURIComponent(
    token,
  )}&clientId=${encodeURIComponent(clientId)}&authType=2`;
}

function defaultFactory(url: string): WebSocketLike {
  return new WebSocket(url);
}

function toBuffer(data: unknown): Buffer | null {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === "string") {
    return Buffer.from(data);
  }

  if (Array.isArray(data) && data.every((item) => Buffer.isBuffer(item))) {
    return Buffer.concat(data);
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  return null;
}
