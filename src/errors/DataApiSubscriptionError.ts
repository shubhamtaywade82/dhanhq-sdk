import { ApiResponseError } from "./ApiResponseError";

export interface DataApiSubscriptionErrorOptions {
  /** HTTP status of the rejected request; absent when the plan check itself refused. */
  status?: number;
  details?: unknown;
  cause?: unknown;
}

/**
 * The account is not entitled to a Data API endpoint: Dhan answered `DH-902`
 * (numeric `806` on the feed), or `client.profile.assertDataApiActive()` found
 * the Data API plan inactive. The message says which. Subclasses
 * {@link ApiResponseError}, so existing `instanceof ApiResponseError` checks
 * keep working. It is never retried: the plan or entitlement has to change first.
 */
export class DataApiSubscriptionError extends ApiResponseError {
  constructor(message: string, options: DataApiSubscriptionErrorOptions = {}) {
    super(
      message,
      options.status,
      options.details,
      options.cause,
      "DATA_API_NOT_SUBSCRIBED",
    );
    this.name = "DataApiSubscriptionError";
  }
}
