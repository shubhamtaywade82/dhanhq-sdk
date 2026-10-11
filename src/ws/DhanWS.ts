import type { InstrumentSubscription } from "../types/common.types";
import type { DhanWSOptions, MarketDepthMode } from "../types/ws.types";
import type { Logger } from "../types/logger.types";
import { MarketDepthWS } from "./MarketDepthWS";
import { MarketFeedWS } from "./MarketFeedWS";
import { OrderUpdateWS } from "./OrderUpdateWS";
import { LTPStore } from "./store/LTPStore";
import { OrderStore } from "./store/OrderStore";

export class DhanWS {
  public readonly ltpStore = new LTPStore();
  public readonly orderStore = new OrderStore();
  public readonly market: MarketFeedWS;
  public readonly orders: OrderUpdateWS;
  public depth?: MarketDepthWS;
  private readonly logger?: Logger;

  constructor(private readonly options: DhanWSOptions) {
    this.logger = options.logger;
    this.market = new MarketFeedWS(
      {
        token: options.token,
        tokenProvider: options.tokenProvider,
        clientId: options.clientId,
        url: options.marketFeedUrl,
        reconnectDelayMs: options.reconnectDelayMs,
        maxReconnectDelayMs: options.maxReconnectDelayMs,
        maxReconnectAttempts: options.maxReconnectAttempts,
        webSocketFactory: options.marketSocketFactory,
        logger: options.logger,
      },
      this.ltpStore,
    );
    this.orders = new OrderUpdateWS(
      {
        token: options.token,
        tokenProvider: options.tokenProvider,
        clientId: options.clientId,
        url: options.orderUpdateUrl,
        reconnectDelayMs: options.reconnectDelayMs,
        maxReconnectDelayMs: options.maxReconnectDelayMs,
        maxReconnectAttempts: options.maxReconnectAttempts,
        webSocketFactory: options.orderSocketFactory,
        userType: options.orderUserType,
        partnerId: options.partnerId,
        partnerSecret: options.partnerSecret,
        logger: options.logger,
      },
      this.orderStore,
    );

    if (options.blockedBy) {
      this.market.block(options.blockedBy);
      this.orders.block(options.blockedBy);
    }
  }

  /**
   * Initializes market depth streaming (20-level or 200-level).
   */
  public enableDepth(mode: MarketDepthMode = "twenty"): MarketDepthWS {
    this.depth = new MarketDepthWS({
      token: this.options.token,
      tokenProvider: this.options.tokenProvider,
      clientId: this.options.clientId,
      url: this.options.depthUrl,
      reconnectDelayMs: this.options.reconnectDelayMs,
      maxReconnectDelayMs: this.options.maxReconnectDelayMs,
      maxReconnectAttempts: this.options.maxReconnectAttempts,
      webSocketFactory: this.options.depthSocketFactory,
      mode,
    });
    if (this.options.blockedBy) {
      this.depth.block(this.options.blockedBy);
    }
    return this.depth;
  }

  public async connect(): Promise<void> {
    const promises: Array<Promise<void>> = [
      this.market.connect(),
      this.orders.connect(),
    ];
    if (this.depth) {
      promises.push(this.depth.connect());
    }
    await Promise.all(promises);
  }

  public disconnect(): void {
    this.market.disconnect();
    this.orders.disconnect();
    this.depth?.disconnect();
  }

  public subscribe(instruments: InstrumentSubscription[]): void {
    this.market.subscribe(instruments);
  }
}
