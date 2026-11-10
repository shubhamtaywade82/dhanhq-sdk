import { DataApiErrorCode, FEED_TERMINAL_DISCONNECT_CODES } from "../constants";
import { DhanError } from "./DhanError";

/**
 * True when the server's disconnect reason cannot be fixed by reconnecting
 * with the same token and subscriptions (see `FEED_TERMINAL_DISCONNECT_CODES`).
 */
export function isTerminalFeedDisconnect(reasonCode: number): boolean {
  return FEED_TERMINAL_DISCONNECT_CODES.includes(reasonCode);
}

/**
 * The server ended a market-feed or depth connection with a reason that a
 * reconnect cannot clear. The socket is halted: no automatic reconnect, and
 * every later `connect()` on that instance rejects with this error. Create a
 * new feed instance after fixing the cause (plan, token, client ID, caps).
 */
export class FeedDisconnectError extends DhanError {
  public readonly reasonCode: number;
  /** Symbolic name from {@link DataApiErrorCode}, or `"UNKNOWN"`. */
  public readonly reason: string;

  constructor(reasonCode: number) {
    const reason = DataApiErrorCode[reasonCode] ?? "UNKNOWN";
    super(
      `Market feed disconnected by server: ${reason} (${reasonCode}). ` +
        "Reconnecting cannot clear this; fix the cause and create a new feed instance.",
      { code: "FEED_DISCONNECTED_TERMINAL", details: { reasonCode, reason } },
    );
    this.name = "FeedDisconnectError";
    this.reasonCode = reasonCode;
    this.reason = reason;
  }
}
