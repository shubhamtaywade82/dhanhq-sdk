import { DhanError } from "./DhanError";

/** Shape of the JSON body DhanHQ returns alongside a non-2xx REST response. */
export interface DhanApiErrorBody {
  /** Broker-assigned category, e.g. `"Order_Error"`. */
  errorType?: string;
  /** The `DH-9xx` code from {@link TradingErrorCode} in `../constants`. */
  errorCode?: string;
  /** Human-readable description, when Dhan provided one. */
  errorMessage?: string;
}

/** Best-effort extraction of Dhan's `{errorType, errorCode, errorMessage}` envelope. */
export function parseDhanErrorBody(details: unknown): DhanApiErrorBody {
  if (typeof details !== "object" || details === null) {
    return {};
  }

  const body = details as Record<string, unknown>;
  return {
    errorType: typeof body.errorType === "string" ? body.errorType : undefined,
    errorCode: typeof body.errorCode === "string" ? body.errorCode : undefined,
    errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined,
  };
}

export class ApiResponseError extends DhanError {
  /** Dhan's own error code from the response body, e.g. `"DH-906"` — see {@link TradingErrorCode}. */
  public readonly errorCode?: string;
  /** Dhan's own error category from the response body, e.g. `"Order_Error"`. */
  public readonly errorType?: string;
  /** Dhan's own human-readable message from the response body, when present. */
  public readonly errorMessage?: string;

  constructor(message: string, status: number, details?: unknown, cause?: unknown) {
    super(message, {
      code: "API_RESPONSE_ERROR",
      status,
      details,
      cause,
    });
    this.name = "ApiResponseError";

    const parsed = parseDhanErrorBody(details);
    this.errorCode = parsed.errorCode;
    this.errorType = parsed.errorType;
    this.errorMessage = parsed.errorMessage;
  }
}
