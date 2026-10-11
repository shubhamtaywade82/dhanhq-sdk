import type { MultiScripMarginCalcResponse, ScriptItem } from "../generated";
import type { KnowYourMarginResponse as MarginCalculationResponse } from "../generated";

import { HttpClient } from "../client/HttpClient";

/**
 * Plain string-literal request shape for a single margin-calculation leg — the
 * generated `ScriptItem` type uses TS enums for `exchangeSegment`/
 * `transactionType`/`productType`, so `exchangeSegment: "NSE_FNO"` doesn't
 * type-check against it directly. Deriving the literal unions from the enums
 * via `${Enum}` keeps them in sync with `npm run generate`.
 */
export interface MarginScriptItem {
  exchangeSegment?: `${ScriptItem.exchangeSegment}`;
  transactionType?: `${ScriptItem.transactionType}`;
  quantity?: number;
  productType?: `${ScriptItem.productType}`;
  securityId?: string;
  price?: number;
  triggerPrice?: number;
}

/**
 * Margin Calculator API wrapper.
 * 
 * Supports both single-order and multi-leg margin calculations with hedge benefits.
 * For F&O strategies (spreads, iron condors, etc.), use the multi-leg endpoint to
 * get combined margin requirements with hedging benefits applied.
 * 
 * @see https://dhan.co/help/docs/api/v2/#margin-calculator
 */
export class MarginCalculator {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Calculate margin for a single order.
   * 
   * @example
   * ```ts
   * const margin = await client.marginCalculator.calculateSingle({
   *   exchangeSegment: "NSE_FNO",
   *   productType: "INTRADAY",
   *   optionType: "CALL",
   *   instrumentType: "OPTIDX",
   *   securityId: "44000", // NIFTY 24500 CE
   *   transactionType: "BUY",
   *   quantity: 50,
   *   price: 150.00,
   * });
   * ```
   */
  public async calculateSingle(
    request: MarginScriptItem,
  ): Promise<MarginCalculationResponse> {
    // `/margincalculator` takes one order as a flat object; `scripList` is
    // only understood by `/margincalculator/multi`.
    return this.httpClient.request<MarginCalculationResponse, MarginScriptItem>({
      method: "POST",
      url: "/margincalculator",
      data: request,
      safeToRetry: true,
    });
  }

  /**
   * Calculate margin for multiple legs with hedge benefits.
   * 
   * This is essential for multi-leg strategies like spreads, straddles, and iron condors,
   * where margin benefits are applied due to hedging.
   * 
   * @example
   * ```ts
   * // Bull Call Spread: Buy lower strike call, sell higher strike call
   * const margin = await client.marginCalculator.calculateMulti([
   *   {
   *     exchangeSegment: "NSE_FNO",
   *     productType: "INTRADAY",
   *     securityId: "44000", // NIFTY 24500 CE
   *     transactionType: "BUY",
   *     quantity: 50,
   *     price: 150.00,
   *   },
   *   {
   *     exchangeSegment: "NSE_FNO",
   *     productType: "INTRADAY",
   *     securityId: "44050", // NIFTY 24600 CE
   *     transactionType: "SELL",
   *     quantity: 50,
   *     price: 100.00,
   *   },
   * ]);
   * 
   * // The response will show reduced margin due to hedge benefits
   * ```
   * 
   * @param legs Array of order legs for the strategy
   */
  public async calculateMulti(
    legs: MarginScriptItem[],
  ): Promise<MultiScripMarginCalcResponse> {
    return this.httpClient.request<MultiScripMarginCalcResponse, { scripList: MarginScriptItem[] }>({
      method: "POST",
      url: "/margincalculator/multi",
      data: {
        scripList: legs,
      },
      safeToRetry: true,
    });
  }

  /**
   * Helper: Build a bull call spread margin calculation.
   * 
   * @example
   * ```ts
   * const margin = await client.marginCalculator.bullCallSpread({
   *   longStrikeSecurityId: "44000", // Lower strike (buy)
   *   shortStrikeSecurityId: "44050", // Higher strike (sell)
   *   quantity: 50,
   *   longPrice: 150.00,
   *   shortPrice: 100.00,
   * });
   * ```
   */
  public async bullCallSpread(options: {
    longStrikeSecurityId: string;
    shortStrikeSecurityId: string;
    quantity: number;
    longPrice: number;
    shortPrice: number;
    productType?: `${ScriptItem.productType}`;
  }): Promise<MultiScripMarginCalcResponse> {
    const {
      longStrikeSecurityId,
      shortStrikeSecurityId,
      quantity,
      longPrice,
      shortPrice,
      productType = "INTRADAY",
    } = options;

    return this.calculateMulti([
      {
        exchangeSegment: "NSE_FNO",
        productType,
        securityId: longStrikeSecurityId,
        transactionType: "BUY",
        quantity,
        price: longPrice,
      },
      {
        exchangeSegment: "NSE_FNO",
        productType,
        securityId: shortStrikeSecurityId,
        transactionType: "SELL",
        quantity,
        price: shortPrice,
      },
    ]);
  }

  /**
   * Helper: Build a bull put spread margin calculation.
   * 
   * @example
   * ```ts
   * const margin = await client.marginCalculator.bullPutSpread({
   *   longStrikeSecurityId: "43950", // Lower strike (buy put)
   *   shortStrikeSecurityId: "44000", // Higher strike (sell put)
   *   quantity: 50,
   *   longPrice: 80.00,
   *   shortPrice: 120.00,
   * });
   * ```
   */
  public async bullPutSpread(options: {
    longStrikeSecurityId: string;
    shortStrikeSecurityId: string;
    quantity: number;
    longPrice: number;
    shortPrice: number;
    productType?: `${ScriptItem.productType}`;
  }): Promise<MultiScripMarginCalcResponse> {
    const {
      longStrikeSecurityId,
      shortStrikeSecurityId,
      quantity,
      longPrice,
      shortPrice,
      productType = "INTRADAY",
    } = options;

    return this.calculateMulti([
      {
        exchangeSegment: "NSE_FNO",
        productType,
        securityId: longStrikeSecurityId,
        transactionType: "BUY",
        quantity,
        price: longPrice,
      },
      {
        exchangeSegment: "NSE_FNO",
        productType,
        securityId: shortStrikeSecurityId,
        transactionType: "SELL",
        quantity,
        price: shortPrice,
      },
    ]);
  }

  /**
   * Helper: Build an iron condor margin calculation (4 legs).
   * 
   * @example
   * ```ts
   * const margin = await client.marginCalculator.ironCondor({
   *   longPutSecurityId: "43900",
   *   shortPutSecurityId: "43950",
   *   shortCallSecurityId: "44050",
   *   longCallSecurityId: "44100",
   *   quantity: 50,
   *   prices: {
   *     longPut: 50.00,
   *     shortPut: 80.00,
   *     shortCall: 70.00,
   *     longCall: 40.00,
   *   },
   * });
   * ```
   */
  public async ironCondor(options: {
    longPutSecurityId: string;
    shortPutSecurityId: string;
    shortCallSecurityId: string;
    longCallSecurityId: string;
    quantity: number;
    prices: {
      longPut: number;
      shortPut: number;
      shortCall: number;
      longCall: number;
    };
    productType?: `${ScriptItem.productType}`;
  }): Promise<MultiScripMarginCalcResponse> {
    const {
      longPutSecurityId,
      shortPutSecurityId,
      shortCallSecurityId,
      longCallSecurityId,
      quantity,
      prices,
      productType = "INTRADAY",
    } = options;

    return this.calculateMulti([
      {
        exchangeSegment: "NSE_FNO",
        productType,
        securityId: longPutSecurityId,
        transactionType: "BUY",
        quantity,
        price: prices.longPut,
      },
      {
        exchangeSegment: "NSE_FNO",
        productType,
        securityId: shortPutSecurityId,
        transactionType: "SELL",
        quantity,
        price: prices.shortPut,
      },
      {
        exchangeSegment: "NSE_FNO",
        productType,
        securityId: shortCallSecurityId,
        transactionType: "SELL",
        quantity,
        price: prices.shortCall,
      },
      {
        exchangeSegment: "NSE_FNO",
        productType,
        securityId: longCallSecurityId,
        transactionType: "BUY",
        quantity,
        price: prices.longCall,
      },
    ]);
  }
}
