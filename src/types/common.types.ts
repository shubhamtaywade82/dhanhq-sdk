import type { DhanMode } from "../client/Environment";
import type { CircuitBreakerOptions } from "../client/CircuitBreaker";

export interface DhanClientConfig {
  token?: string;
  clientId: string;
  tokenProvider?: () => Promise<string> | string;
  onTokenExpired?: (error: unknown) => Promise<void> | void;
  /** Production REST host. Defaults to `https://api.dhan.co/v2`. */
  baseURL?: string;
  /**
   * Which host each request goes to: `live` (default), `sandbox`, or
   * `hybrid` (market data from production, trading on the sandbox).
   * See `DhanMode`. `DhanClient.fromEnv` reads `DHAN_MODE`.
   */
  mode?: DhanMode;
  /** Sandbox REST host. Defaults to `https://sandbox.dhan.co/v2`. */
  sandboxBaseURL?: string;
  /**
   * Credentials for the sandbox (generated on Dhan Cloud, cloud.dhanhq.co).
   * Dhan rejects production tokens on the sandbox and vice versa, so
   * sandbox-bound requests use these. Required in `hybrid` mode; in `sandbox`
   * mode they fall back to `token`/`tokenProvider`/`clientId`.
   */
  sandboxToken?: string;
  sandboxTokenProvider?: () => Promise<string> | string;
  sandboxClientId?: string;
  timeoutMs?: number;
  rateLimitMinTimeMs?: number;
  /**
   * Trips after consecutive network/5xx failures so a struggling backend
   * doesn't get hammered by every in-flight caller. Pass `false` to disable.
   */
  circuitBreaker?: CircuitBreakerOptions | false;
  wsUrl?: string;
  marketFeedUrl?: string;
  orderUpdateUrl?: string;
  wsReconnectDelayMs?: number;
  wsOrderUserType?: "SELF" | "PARTNER";
  partnerId?: string;
  partnerSecret?: string;
  /** How long a parsed scrip-master segment stays cached. Defaults to 1 hour. */
  instrumentCacheTtlMs?: number;
}

export interface CorrelatedRequest {
  correlationId?: string;
}

export interface OrderOperationResult<T> {
  correlationId: string;
  data: T;
}

export interface InstrumentSubscription {
  securityId: string;
  exchangeSegment: string;
}

export interface TickEvent extends InstrumentSubscription {
  ltp?: number;
  timestamp?: number;
  raw: unknown;
}
