import type { InstrumentSubscription } from "../types/common.types";
import type { DhanWSOptions, Logger, MarketTickerEvent, MarketQuoteEvent, MarketFullEvent } from "../types/ws.types";
import { DhanWS } from "./DhanWS";
import type { MarketFeedEvent } from "../types/ws.types";
import { GreeksCalculator, type TickWithGreeks } from "../analytics/GreeksCalculator";

/**
 * Configuration for the WebSocket Manager.
 */
export interface WebSocketManagerConfig extends DhanWSOptions {
  /** Maximum instruments per subscription batch (Dhan limit: 5000) */
  maxInstrumentsPerBatch?: number;
  /** Enable automatic reconnection with exponential backoff */
  enableAutoReconnect?: boolean;
  /** Maximum reconnection delay in ms (default: 30000) */
  maxReconnectDelayMs?: number;
  /** Enable Greeks calculation on ticks */
  enableGreeksCalculation?: boolean;
  /** Default risk-free rate for Greeks */
  defaultRiskFreeRate?: number;
  /** Default IV for Greeks */
  defaultImpliedVolatility?: number;
}

/**
 * Option contract metadata required for Greeks calculation.
 */
export interface OptionContractMetadata {
  securityId: string;
  strike: number;
  expiryDate: Date | string;
  optionType: "call" | "put";
  underlyingSecurityId: string; // e.g., "1333" for Nifty
  impliedVolatility?: number;
}

/**
 * Enhanced WebSocket Manager with auto-reconnect, batching, and Greeks.
 * 
 * This wrapper around DhanWS provides:
 * - Automatic instrument batching (max 5000 per subscription)
 * - Exponential backoff reconnection
 * - State restoration (re-subscription after disconnect)
 * - Real-time Greeks calculation on ticks
 * - Underlying spot price tracking
 * 
 * @example
 * ```ts
 * const wsManager = new WebSocketManager({
 *   token: accessToken,
 *   clientId: client_id,
 *   maxInstrumentsPerBatch: 4000,
 *   enableAutoReconnect: true,
 *   enableGreeksCalculation: true,
 *   defaultRiskFreeRate: 0.065,
 * });
 * 
 * // Subscribe to entire BankNifty weekly chain
 * const bankNiftyStrikes = [44000, 44050, 44100, ...]; // 50 strikes
 * const subscriptions = bankNiftyStrikes.flatMap(strike => [
 *   { exchangeSegment: "NSE_FNO", securityId: getCallId(strike) },
 *   { exchangeSegment: "NSE_FNO", securityId: getPutId(strike) },
 * ]);
 * 
 * wsManager.subscribe(subscriptions, {
 *   "44000": { strike: 44000, expiryDate: "2026-01-30", optionType: "call", ... },
 *   // ... more contracts
 * });
 * 
 * // Listen to enriched ticks with Greeks
 * wsManager.onTick((tick) => {
 *   if (tick.greeks) {
 *     console.log(`Delta: ${tick.greeks.delta}, Theta: ${tick.greeks.theta}`);
 *   }
 * });
 * 
 * await wsManager.connect();
 * ```
 */
export class WebSocketManager {
  private readonly dhanWS: DhanWS;
  private readonly maxInstrumentsPerBatch: number;
  private readonly enableGreeksCalculation: boolean;
  private readonly greeksCalculator?: GreeksCalculator;
  private readonly optionMetadata = new Map<string, OptionContractMetadata>();
  private readonly underlyingSpots = new Map<string, number>();
  private subscribedInstruments: InstrumentSubscription[] = [];
  private onTickCallback?: (tick: TickWithGreeks) => void;
  private reconnectAttempts = 0;
  private maxReconnectDelayMs: number;
  private isReconnecting = false;
  private readonly logger?: Logger;

  constructor(config: WebSocketManagerConfig) {
    this.maxInstrumentsPerBatch = config.maxInstrumentsPerBatch ?? 4000;
    this.enableGreeksCalculation = config.enableGreeksCalculation ?? false;
    this.maxReconnectDelayMs = config.maxReconnectDelayMs ?? 30000;
    this.logger = config.logger;

    if (this.enableGreeksCalculation) {
      this.greeksCalculator = new GreeksCalculator({
        defaultRiskFreeRate: config.defaultRiskFreeRate ?? 0.065,
        defaultImpliedVolatility: config.defaultImpliedVolatility ?? 0.18,
      });
    }

    this.dhanWS = new DhanWS(config);

    // Wire up tick handler - only process ticks with LTP data for Greeks
    this.dhanWS.market.on("tick", (tick: MarketFeedEvent) => {
      // Only pass ticker, quote, and full events to handleTick
      if (tick.type === "ticker" || tick.type === "quote" || tick.type === "full") {
        this.handleTick(tick);
      }
    });

    // Wire up disconnect handler for auto-reconnect
    if (config.enableAutoReconnect !== false) {
      this.dhanWS.market.on("disconnect", () => {
        this.handleDisconnect();
      });
    }
  }

  /**
   * Connect to WebSocket servers.
   */
  public async connect(): Promise<void> {
    await this.dhanWS.connect();
  }

  /**
   * Disconnect from WebSocket servers.
   */
  public disconnect(): void {
    this.dhanWS.disconnect();
  }

  /**
   * Subscribe to instruments with automatic batching.
   * 
   * If the number of instruments exceeds the batch size, they are split
   * into multiple subscription requests automatically.
   * 
   * @param instruments - Array of instrument subscriptions
   * @param optionMetadataMap - Optional metadata for options (for Greeks calculation)
   */
  public subscribe(
    instruments: InstrumentSubscription[],
    optionMetadataMap?: Record<string, OptionContractMetadata>,
  ): void {
    // Store option metadata for Greeks calculation
    if (optionMetadataMap) {
      for (const [securityId, metadata] of Object.entries(optionMetadataMap)) {
        this.optionMetadata.set(securityId, metadata);
      }
    }

    // Add to subscribed instruments list for reconnection
    for (const instrument of instruments) {
      const key = `${instrument.exchangeSegment}:${instrument.securityId}`;
      if (!this.subscribedInstruments.some(
        (sub) => `${sub.exchangeSegment}:${sub.securityId}` === key,
      )) {
        this.subscribedInstruments.push(instrument);
      }
    }

    // Batch subscriptions
    const batches = this.chunkInstruments(instruments);
    for (const batch of batches) {
      this.dhanWS.subscribe(batch);
    }
  }

  /**
   * Unsubscribe from instruments.
   */
  public unsubscribe(instruments: InstrumentSubscription[]): void {
    this.dhanWS.market.unsubscribe(instruments);

    // Remove from subscribed instruments list
    const keysToRemove = new Set(
      instruments.map((inst) => `${inst.exchangeSegment}:${inst.securityId}`),
    );
    this.subscribedInstruments = this.subscribedInstruments.filter(
      (inst) => !keysToRemove.has(`${inst.exchangeSegment}:${inst.securityId}`),
    );
  }

  /**
   * Update underlying spot price (used for Greeks calculation).
   * 
   * @param underlyingSecurityId - Security ID of the underlying index (e.g., "1333" for Nifty)
   * @param spotPrice - Current spot price
   */
  public updateUnderlyingSpot(underlyingSecurityId: string, spotPrice: number): void {
    this.underlyingSpots.set(underlyingSecurityId, spotPrice);
  }

  /**
   * Set callback for enriched ticks (with Greeks).
   */
  public onTick(callback: (tick: TickWithGreeks) => void): void {
    this.onTickCallback = callback;
  }

  /**
   * Get all currently subscribed instruments.
   */
  public getSubscribedInstruments(): InstrumentSubscription[] {
    return [...this.subscribedInstruments];
  }

  /**
   * Check if connected.
   */
  public isConnected(): boolean {
    return this.dhanWS.market.isConnected;
  }

  /**
   * Get LTP store reference.
   */
  public getLTPStore() {
    return this.dhanWS.ltpStore;
  }

  private chunkInstruments(
    instruments: InstrumentSubscription[],
  ): InstrumentSubscription[][] {
    const batches: InstrumentSubscription[][] = [];
    for (
      let index = 0;
      index < instruments.length;
      index += this.maxInstrumentsPerBatch
    ) {
      batches.push(
        instruments.slice(index, index + this.maxInstrumentsPerBatch),
      );
    }
    return batches;
  }

  private handleTick(tick: MarketTickerEvent | MarketQuoteEvent | MarketFullEvent): void {
    let enrichedTick: TickWithGreeks = tick;

    // Calculate Greeks if enabled and this is an option
    if (
      this.enableGreeksCalculation &&
      this.greeksCalculator &&
      tick.ltp &&
      tick.ltp > 0
    ) {
      const metadata = this.optionMetadata.get(tick.securityId);
      if (metadata) {
        const underlyingSpot =
          this.underlyingSpots.get(metadata.underlyingSecurityId) ?? 0;

        if (underlyingSpot > 0) {
          enrichedTick = this.greeksCalculator.processTick(tick, metadata, underlyingSpot);
        }
      }
    }

    // Call user callback
    if (this.onTickCallback) {
      this.onTickCallback(enrichedTick);
    }
  }

  private async handleDisconnect(): Promise<void> {
    if (this.isReconnecting || !this.subscribedInstruments.length) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    // Exponential backoff
    const delay = Math.min(
      1000 * 2 ** this.reconnectAttempts,
      this.maxReconnectDelayMs,
    );

    this.logger?.info(`[WebSocketManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      // Reconnect
      await this.dhanWS.connect();

      // Re-subscribe to all instruments
      const batches = this.chunkInstruments(this.subscribedInstruments);
      for (const batch of batches) {
        this.dhanWS.subscribe(batch);
      }

      this.logger?.info(
        `[WebSocketManager] Reconnected and restored ${this.subscribedInstruments.length} subscriptions`,
      );
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error("[WebSocketManager] Reconnection failed:", error);
      // Schedule another attempt
      this.isReconnecting = false;
      this.handleDisconnect();
    } finally {
      this.isReconnecting = false;
    }
  }
}
