import { ApiResponseError } from "./ApiResponseError";

/**
 * A Data API call (market quote, historical/intraday charts, expired options,
 * option chain, ScanX analytics) was rejected because the account has no
 * active Data API plan. Dhan reports this as `DH-902` ("invalid access") on
 * these endpoints; on the feed it is numeric `806`.
 *
 * Subclasses {@link ApiResponseError}, so existing `instanceof ApiResponseError`
 * checks keep working. It is never retried: the plan has to be bought first.
 */
export class DataApiSubscriptionError extends ApiResponseError {
  constructor(
    status: number,
    details?: unknown,
    cause?: unknown,
    errorMessage?: string,
  ) {
    super(
      "Data API subscription required: this account lacks an active Data API plan (Dhan DH-902). " +
        `Subscribe at dhanhq.co before calling data endpoints.${
          errorMessage ? ` Dhan said: ${errorMessage}` : ""
        }`,
      status,
      details,
      cause,
      "DATA_API_NOT_SUBSCRIBED",
    );
    this.name = "DataApiSubscriptionError";
  }
}
