import type {
  AlertCondition,
  AlertOrder,
  AlertOrderResponse,
  GetAlertResponse,
} from "../generated";

import { HttpClient } from "../client/HttpClient";

/**
 * Plain string-literal request shapes for {@link ConditionalTriggers} — the
 * generated `AlertCondition`/`AlertOrder`/`AlertOrderRequest` types use TS
 * enums for these fields, so `comparisonType: "PRICE_WITH_VALUE"` doesn't
 * type-check against them directly. Deriving the literal unions from the
 * enums via `${Enum}` keeps them in sync with `npm run generate` without
 * hand-transcribing every member (`indicatorName` alone has 20+).
 */
export interface AlertConditionInput {
  comparisonType?: `${AlertCondition.comparisonType}`;
  exchangeSegment?: `${AlertCondition.exchangeSegment}`;
  securityId: string;
  indicatorName?: `${AlertCondition.indicatorName}`;
  timeFrame?: `${AlertCondition.timeFrame}`;
  operator?: `${AlertCondition.operator}`;
  comparingValue?: number;
  comparingIndicatorName?: `${AlertCondition.comparingIndicatorName}`;
  /** Expiry date of alert */
  expDate?: string;
  frequency?: `${AlertCondition.frequency}`;
  userNote?: string;
}

export interface AlertOrderInput {
  transactionType: `${AlertOrder.transactionType}`;
  exchangeSegment: `${AlertOrder.exchangeSegment}`;
  productType: `${AlertOrder.productType}`;
  orderType: `${AlertOrder.orderType}`;
  securityId: string;
  quantity: number;
  validity: `${AlertOrder.validity}`;
  /** e.g. "250.5" */
  price?: string;
  /** e.g. "100" */
  discQuantity?: string;
  /** e.g. "2500.0" */
  triggerPrice?: string;
}

export interface PlaceConditionalTriggerRequest {
  dhanClientId: string;
  condition: AlertConditionInput;
  orders: AlertOrderInput[];
}

export type ModifyConditionalTriggerRequest = Partial<PlaceConditionalTriggerRequest>;

/**
 * Conditional Trigger Orders (Alert Orders) API wrapper.
 *
 * This wraps the /v2/alerts/orders endpoints for placing orders triggered by
 * price or technical indicators. Unlike standard GTT/Forever orders, conditional
 * triggers support:
 * - PRICE_WITH_VALUE: Trigger when price crosses a specific value
 * - TECHNICAL_WITH_VALUE: Trigger when an indicator (SMA, RSI, etc.) crosses a value
 * - TECHNICAL_WITH_INDICATOR: Trigger when one indicator crosses another (e.g., SMA_20 > SMA_50)
 * - Multiple orders can be triggered from a single condition
 *
 * @see https://docs.dhanhq.co/api/v2/conditional-triggers
 */
export class ConditionalTriggers {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * List all conditional trigger orders.
   */
  public async list(): Promise<GetAlertResponse[]> {
    return this.httpClient.request<GetAlertResponse[]>({
      method: "GET",
      url: "/alerts/orders",
      safeToRetry: true,
    });
  }

  /**
   * Get a specific conditional trigger order by ID.
   */
  public async getById(alertId: string): Promise<GetAlertResponse> {
    return this.httpClient.request<GetAlertResponse>({
      method: "GET",
      url: `/alerts/orders/${encodeURIComponent(alertId)}`,
      safeToRetry: true,
    });
  }

  /**
   * Place a new conditional trigger order.
   *
   * @example
   * ```ts
   * // Price-based trigger: buy a NIFTY option when the index spot crosses 24,500
   * await client.conditionalTriggers.place({
   *   dhanClientId: process.env.DHAN_CLIENT_ID!,
   *   condition: {
   *     comparisonType: "PRICE_WITH_VALUE",
   *     exchangeSegment: "IDX_I",
   *     securityId: "13", // NIFTY 50 index
   *     operator: "GREATER_THAN",
   *     comparingValue: 24500,
   *     frequency: "ONCE",
   *   },
   *   orders: [{
   *     transactionType: "BUY",
   *     exchangeSegment: "NSE_FNO",
   *     productType: "INTRADAY",
   *     orderType: "MARKET",
   *     validity: "DAY",
   *     securityId: "44000", // the FNO contract to buy when triggered
   *     quantity: 50,
   *   }],
   * });
   *
   * // Technical trigger: Buy when RSI crosses above 30
   * await client.conditionalTriggers.place({
   *   dhanClientId: process.env.DHAN_CLIENT_ID!,
   *   condition: {
   *     comparisonType: "TECHNICAL_WITH_VALUE",
   *     exchangeSegment: "NSE_EQ",
   *     securityId: "26009", // RELIANCE
   *     indicatorName: "RSI_14",
   *     timeFrame: "FIFTEEN_MIN",
   *     operator: "CROSSING_UP",
   *     comparingValue: 30,
   *     frequency: "ONCE",
   *   },
   *   orders: [ { transactionType: "BUY", exchangeSegment: "NSE_FNO", productType: "INTRADAY", orderType: "MARKET", validity: "DAY", securityId: "44000", quantity: 50 } ],
   * });
   * ```
   */
  public async place(
    request: PlaceConditionalTriggerRequest,
  ): Promise<AlertOrderResponse> {
    return this.httpClient.request<AlertOrderResponse, PlaceConditionalTriggerRequest>({
      method: "POST",
      url: "/alerts/orders",
      data: request,
      safeToRetry: false,
    });
  }

  /**
   * Modify an existing conditional trigger order.
   */
  public async modify(
    alertId: string,
    request: ModifyConditionalTriggerRequest,
  ): Promise<AlertOrderResponse> {
    return this.httpClient.request<AlertOrderResponse, ModifyConditionalTriggerRequest>({
      method: "PUT",
      url: `/alerts/orders/${encodeURIComponent(alertId)}`,
      data: request,
      safeToRetry: false,
    });
  }

  /**
   * Cancel/delete a conditional trigger order.
   */
  public async cancel(alertId: string): Promise<AlertOrderResponse> {
    return this.httpClient.request<AlertOrderResponse>({
      method: "DELETE",
      url: `/alerts/orders/${encodeURIComponent(alertId)}`,
      safeToRetry: false,
    });
  }

  /**
   * Helper: Build a price-based condition for options buying stop-loss.
   *
   * @example
   * ```ts
   * const condition = ConditionalTriggers.buildPriceCondition({
   *   exchangeSegment: "IDX_I",
   *   securityId: "13", // NIFTY 50 index
   *   triggerAbove: 24500, // Trigger when Nifty goes above 24500
   * });
   * ```
   */
  public static buildPriceCondition(options: {
    exchangeSegment: AlertConditionInput["exchangeSegment"];
    securityId: string;
    triggerAbove?: number;
    triggerBelow?: number;
    frequency?: "ONCE";
  }): AlertConditionInput {
    const { exchangeSegment, securityId, frequency = "ONCE" } = options;

    if (options.triggerAbove !== undefined && options.triggerBelow !== undefined) {
      throw new Error("Specify either triggerAbove or triggerBelow, not both");
    }

    if (options.triggerAbove !== undefined) {
      return {
        comparisonType: "PRICE_WITH_VALUE",
        exchangeSegment,
        securityId,
        operator: "GREATER_THAN",
        comparingValue: options.triggerAbove,
        frequency,
      };
    }

    if (options.triggerBelow !== undefined) {
      return {
        comparisonType: "PRICE_WITH_VALUE",
        exchangeSegment,
        securityId,
        operator: "LESS_THAN",
        comparingValue: options.triggerBelow,
        frequency,
      };
    }

    throw new Error("Must specify either triggerAbove or triggerBelow");
  }

  /**
   * Helper: Build a technical indicator-based condition.
   *
   * @example
   * ```ts
   * const condition = ConditionalTriggers.buildTechnicalCondition({
   *   exchangeSegment: "NSE_EQ",
   *   securityId: "26009", // RELIANCE
   *   indicatorName: "SMA_20",
   *   timeFrame: "FIFTEEN_MIN",
   *   crossingAbove: 2500, // Trigger when SMA_20 crosses above 2500
   * });
   * ```
   */
  public static buildTechnicalCondition(options: {
    exchangeSegment: AlertConditionInput["exchangeSegment"];
    securityId: string;
    indicatorName: AlertConditionInput["indicatorName"];
    timeFrame?: AlertConditionInput["timeFrame"];
    crossingAbove?: number;
    crossingBelow?: number;
    frequency?: "ONCE";
  }): AlertConditionInput {
    const { exchangeSegment, securityId, indicatorName, timeFrame = "FIFTEEN_MIN", frequency = "ONCE" } = options;

    if (options.crossingAbove !== undefined && options.crossingBelow !== undefined) {
      throw new Error("Specify either crossingAbove or crossingBelow, not both");
    }

    if (options.crossingAbove !== undefined) {
      return {
        comparisonType: "TECHNICAL_WITH_VALUE",
        exchangeSegment,
        securityId,
        indicatorName,
        timeFrame,
        operator: "CROSSING_UP",
        comparingValue: options.crossingAbove,
        frequency,
      };
    }

    if (options.crossingBelow !== undefined) {
      return {
        comparisonType: "TECHNICAL_WITH_VALUE",
        exchangeSegment,
        securityId,
        indicatorName,
        timeFrame,
        operator: "CROSSING_DOWN",
        comparingValue: options.crossingBelow,
        frequency,
      };
    }

    throw new Error("Must specify either crossingAbove or crossingBelow");
  }
}
