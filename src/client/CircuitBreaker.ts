import { CircuitOpenError } from "../errors/CircuitOpenError";
import type { Logger } from "../types/logger.types";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Consecutive failures required to open the circuit. Defaults to 5. */
  failureThreshold?: number;
  /** How long the circuit stays open before allowing a trial request. Defaults to 30s. */
  resetTimeoutMs?: number;
  /** Which errors count as failures. Defaults to treating every rejection as one. */
  isFailure?: (error: unknown) => boolean;
  logger?: Logger;
}

/**
 * Per-endpoint-tier failures are expected (a bad order, a 4xx) and must not
 * trip this — only sustained transport/server failures should stop new
 * requests from going out.
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly isFailure: (error: unknown) => boolean;
  private readonly logger?: Logger;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.isFailure = options.isFailure ?? (() => true);
    this.logger = options.logger;
  }

  public getState(): CircuitState {
    if (
      this.state === "open" &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      return "half-open";
    }
    return this.state;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();

    if (state === "open") {
      throw new CircuitOpenError(
        `Circuit breaker open; retry in ${this.remainingOpenMs()}ms`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.isFailure(error)) {
        this.onFailure(state);
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state !== "closed") {
      this.logger?.info("Circuit breaker closed", {
        previousState: this.state,
      });
    }
    this.consecutiveFailures = 0;
    this.state = "closed";
  }

  private onFailure(observedState: CircuitState): void {
    this.consecutiveFailures += 1;

    const shouldOpen =
      observedState === "half-open" ||
      this.consecutiveFailures >= this.failureThreshold;

    if (shouldOpen) {
      this.state = "open";
      this.openedAt = Date.now();
      this.logger?.warn("Circuit breaker opened", {
        consecutiveFailures: this.consecutiveFailures,
        resetTimeoutMs: this.resetTimeoutMs,
      });
    }
  }

  private remainingOpenMs(): number {
    return Math.max(0, this.resetTimeoutMs - (Date.now() - this.openedAt));
  }
}
