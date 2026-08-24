import { parseDhanErrorBody } from "./ApiResponseError";
import { DhanError } from "./DhanError";

export interface RateLimitErrorOptions {
  status?: number;
  /** How long to wait before retrying, taken from the response's `Retry-After` header when present. */
  retryAfterMs?: number;
  details?: unknown;
  cause?: unknown;
}

export class RateLimitError extends DhanError {
  /** Milliseconds to wait before retrying, when the broker's `Retry-After` header specified one. */
  public readonly retryAfterMs?: number;
  /** Dhan's own error code from the response body, e.g. `"DH-904"` — see {@link TradingErrorCode}. */
  public readonly errorCode?: string;
  /** Dhan's own error category from the response body, e.g. `"Rate_Limit"`. */
  public readonly errorType?: string;
  /** Dhan's own human-readable message from the response body, when present. */
  public readonly errorMessage?: string;

  constructor(message = "Request rate limit exhausted", options: RateLimitErrorOptions = {}) {
    super(message, {
      code: "RATE_LIMIT_ERROR",
      status: options.status,
      details: options.details,
      cause: options.cause,
    });
    this.name = "RateLimitError";
    this.retryAfterMs = options.retryAfterMs;

    const parsed = parseDhanErrorBody(options.details);
    this.errorCode = parsed.errorCode;
    this.errorType = parsed.errorType;
    this.errorMessage = parsed.errorMessage;
  }
}
