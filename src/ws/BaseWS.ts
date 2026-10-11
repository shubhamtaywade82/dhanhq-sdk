import { EventEmitter } from "events";

import type { WebSocketLike } from "../types/ws.types";
import type { Logger } from "../types/logger.types";

export abstract class BaseWS extends EventEmitter {
  private reconnectTimer?: NodeJS.Timeout;
  protected connection?: WebSocketLike;
  protected manuallyClosed = false;
  protected reconnectAttempts = 0;
  public isConnected = false;
  protected logger?: Logger;
  
  // Heartbeat configuration
  private pingInterval?: NodeJS.Timeout;
  private pongTimeout?: NodeJS.Timeout;
  private readonly pingIntervalMs = 30000; // 30 seconds
  private readonly pongTimeoutMs = 10000;   // 10 seconds

  private readonly maxReconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;

  constructor(
    private readonly urlFactory: () => Promise<string> | string,
    private readonly reconnectDelayMs: number,
    private readonly webSocketFactory: (url: string) => WebSocketLike,
    maxReconnectDelayMs?: number,
    maxReconnectAttempts?: number,
    logger?: Logger,
  ) {
    super();
    this.maxReconnectDelayMs = maxReconnectDelayMs ?? 30000;
    this.maxReconnectAttempts = maxReconnectAttempts ?? Infinity;
    this.logger = logger;
  }

  private blockedBy?: Error;

  /**
   * Makes every later {@link connect} reject with `error` instead of opening a
   * socket — for configurations that can never connect (no point retrying).
   */
  public block(error: Error): void {
    this.blockedBy = error;
  }

  public async connect(): Promise<void> {
    if (this.blockedBy) {
      throw this.blockedBy;
    }
    this.manuallyClosed = false;
    try {
      const url = await this.urlFactory();
      this.connection = this.webSocketFactory(url);
      this.bindConnection(this.connection);
    } catch (error) {
      this.emit("error", error);
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    }
  }

  public disconnect(): void {
    this.manuallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.connection?.close();
  }

  protected send(payload: string | Buffer): void {
    this.connection?.send(payload);
  }

  private bindConnection(connection: WebSocketLike): void {
    connection.on("open", () => {
      this.reconnectAttempts = 0;
      this.isConnected = true;
      this.startHeartbeat();
      void this.onOpen();
    });

    connection.on("message", (data: unknown) => {
      this.onMessage(data);
    });

    connection.on("error", (error: unknown) => {
      this.emit("error", error);
    });

    connection.on("close", () => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.onClose();
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("reconnect_failed", {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
      });
      return;
    }

    const delay = this.calculateBackoff(this.reconnectAttempts);
    
    this.logger?.info(`Reconnecting in ${delay.toFixed(0)}ms`, {
      attempt: this.reconnectAttempts + 1,
      maxAttempts: this.maxReconnectAttempts,
    });
    
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
    // A pending reconnect must never be the sole reason the process stays alive.
    this.reconnectTimer.unref?.();
  }

  /**
   * Calculate exponential backoff with jitter.
   * Formula: min(maxDelay, baseDelay * 2^attempt) ± 25% jitter
   */
  private calculateBackoff(attempt: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = this.maxReconnectDelayMs;
    const exponential = Math.min(
      maxDelay,
      baseDelay * Math.pow(2, Math.min(attempt, 6)) // Cap at 2^6 = 64 seconds
    );
    
    // Add jitter: ±25% randomization to prevent thundering herd
    const jitter = exponential * 0.25 * (Math.random() * 2 - 1);
    
    return exponential + jitter;
  }

  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      try {
        this.send(JSON.stringify({ type: "ping" }));

        this.pongTimeout = setTimeout(() => {
          this.logger?.warn("Pong not received, reconnecting");
          this.connection?.close();
        }, this.pongTimeoutMs);
        this.pongTimeout.unref?.();
      } catch (error) {
        this.logger?.error("Failed to send ping", error as Error);
      }
    }, this.pingIntervalMs);
    // A live socket's own heartbeat must never be the sole reason the
    // process stays alive — matches OrderTracker.waitFor's timer.unref().
    this.pingInterval.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }
  }

  protected abstract onOpen(): Promise<void> | void;
  protected abstract onMessage(data: unknown): void;
  protected abstract onClose(): void;
}
