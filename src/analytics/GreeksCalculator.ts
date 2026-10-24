import type {
  MarketTickerEvent,
  MarketQuoteEvent,
  MarketFullEvent,
} from "../types/ws.types";
import type { Greeks, OptionKind } from "../analytics/blackScholes";
import {
  greeks as calculateGreeks,
  yearsToExpiry,
} from "../analytics/blackScholes";

/**
 * Input parameters for calculating Greeks on a live tick.
 */
export interface GreeksInput {
  /** Current spot price of the underlying index */
  spotPrice: number;
  /** Strike price of the option */
  strike: number;
  /** Expiry date of the option */
  expiryDate: Date | string;
  /** Risk-free rate as annualized decimal (e.g., 0.065 for 6.5%) */
  riskFreeRate: number;
  /** Implied volatility as annualized decimal (e.g., 0.18 for 18%) */
  impliedVolatility: number;
  /** Option type */
  optionType: OptionKind;
}

/**
 * Real-time Greeks calculation result attached to a market tick.
 * Only ticker, quote, and full events have LTP data needed for Greeks.
 */
export type TickWithGreeks = (
  MarketTickerEvent | MarketQuoteEvent | MarketFullEvent
) & {
  greeks?: Greeks;
  impliedVolatility?: number;
  theoreticalPrice?: number;
  underlyingSpot?: number;
};

/**
 * Configuration for the Greeks Calculator.
 */
export interface GreeksCalculatorConfig {
  /** Default risk-free rate if not provided per calculation */
  defaultRiskFreeRate?: number;
  /** Default IV if not provided per calculation */
  defaultImpliedVolatility?: number;
  /** Enable automatic theoretical price calculation */
  enableTheoreticalPrice?: boolean;
}

/**
 * Real-time Greeks Calculator for options.
 *
 * This module calculates Delta, Gamma, Theta, Vega, and Rho in real-time
 * by combining WebSocket tick data with Black-Scholes calculations.
 *
 * For options buyers, this is critical for:
 * - Monitoring theta decay tick-by-tick
 * - Tracking delta exposure for directional bias
 * - Setting informed stop-losses based on Greeks
 * - Calculating theoretical fair value vs market price
 *
 * @example
 * ```ts
 * const calculator = new GreeksCalculator({
 *   defaultRiskFreeRate: 0.065, // 6.5%
 *   defaultImpliedVolatility: 0.18, // 18%
 * });
 *
 * // Calculate Greeks for a NIFTY call option
 * const result = calculator.calculate({
 *   spotPrice: 24500,
 *   strike: 24500,
 *   expiryDate: "2026-01-30",
 *   riskFreeRate: 0.065,
 *   impliedVolatility: 0.20,
 *   optionType: "call",
 * });
 *
 * console.log(result.greeks);
 * // Output: { delta: 0.52, gamma: 0.003, theta: -2.5, vega: 0.15, rho: 0.08 }
 * ```
 */
export class GreeksCalculator {
  private defaultRiskFreeRate: number;
  private defaultImpliedVolatility: number;
  private readonly enableTheoreticalPrice: boolean;

  constructor(config: GreeksCalculatorConfig = {}) {
    this.defaultRiskFreeRate = config.defaultRiskFreeRate ?? 0.065;
    this.defaultImpliedVolatility = config.defaultImpliedVolatility ?? 0.18;
    this.enableTheoreticalPrice = config.enableTheoreticalPrice ?? true;
  }

  /**
   * Calculate Greeks for an option given current market conditions.
   *
   * @returns Object containing Greeks and optionally theoretical price
   */
  public calculate(input: GreeksInput): {
    greeks: Greeks;
    theoreticalPrice?: number;
    timeToExpiry: number;
  } {
    const timeToExpiry = yearsToExpiry(input.expiryDate);

    const greeksResult = calculateGreeks({
      spot: input.spotPrice,
      strike: input.strike,
      timeToExpiry,
      riskFreeRate: input.riskFreeRate ?? this.defaultRiskFreeRate,
      volatility: input.impliedVolatility ?? this.defaultImpliedVolatility,
      optionType: input.optionType,
    });

    const result: {
      greeks: Greeks;
      theoreticalPrice?: number;
      timeToExpiry: number;
    } = {
      greeks: greeksResult,
      timeToExpiry,
    };

    if (this.enableTheoreticalPrice) {
      // Theoretical price calculation would go here
      // For now, we focus on Greeks only to avoid circular dependencies
    }

    return result;
  }

  /**
   * Process a WebSocket tick and attach Greeks to it.
   *
   * This is designed to be called in your WebSocket message handler
   * to enrich every tick with real-time Greeks calculations.
   *
   * @param tick - The raw WebSocket market feed event
   * @param optionDetails - Details about the option contract
   * @param underlyingSpot - Current spot price of the underlying index
   * @returns The tick enriched with Greeks data
   *
   * @example
   * ```ts
   * ws.on('market-feed', (tick) => {
   *   const enrichedTick = calculator.processTick(tick, {
   *     strike: 24500,
   *     expiryDate: "2026-01-30",
   *     optionType: "call",
   *     impliedVolatility: 0.20,
   *   }, 24500); // Nifty spot
   *
   *   console.log(`Delta: ${enrichedTick.greeks?.delta}, Theta: ${enrichedTick.greeks?.theta}`);
   * });
   * ```
   */
  public processTick(
    tick: MarketTickerEvent | MarketQuoteEvent | MarketFullEvent,
    optionDetails: {
      strike: number;
      expiryDate: Date | string;
      optionType: OptionKind;
      impliedVolatility?: number;
    },
    underlyingSpot: number,
  ): TickWithGreeks {
    const result: TickWithGreeks = { ...tick };

    // Only calculate Greeks if we have LTP data
    if (tick.ltp && tick.ltp > 0) {
      const greeksResult = this.calculate({
        spotPrice: underlyingSpot,
        strike: optionDetails.strike,
        expiryDate: optionDetails.expiryDate,
        riskFreeRate: this.defaultRiskFreeRate,
        impliedVolatility:
          optionDetails.impliedVolatility ?? this.defaultImpliedVolatility,
        optionType: optionDetails.optionType,
      });

      result.greeks = greeksResult.greeks;
      result.underlyingSpot = underlyingSpot;
    }

    return result;
  }

  /**
   * Calculate net portfolio Greeks from multiple positions.
   *
   * Essential for AI agents to understand overall portfolio risk:
   * - Net Delta: Directional exposure
   * - Net Theta: Time decay bleeding
   * - Net Vega: Volatility exposure
   *
   * @param positions - Array of option positions with quantities
   * @param currentSpots - Map of security IDs to current underlying spot prices
   * @returns Aggregated portfolio Greeks
   *
   * @example
   * ```ts
   * const portfolioGreeks = calculator.calculatePortfolioGreeks([
   *   {
   *     securityId: "44000",
   *     quantity: 50, // Long 1 lot
   *     strike: 24500,
   *     expiryDate: "2026-01-30",
   *     optionType: "call",
   *     impliedVolatility: 0.20,
   *   },
   *   {
   *     securityId: "44050",
   *     quantity: -50, // Short 1 lot
   *     strike: 24600,
   *     expiryDate: "2026-01-30",
   *     optionType: "call",
   *     impliedVolatility: 0.18,
   *   },
   * ], {
   *   "1333": 24500, // Nifty spot
   * });
   *
   * console.log(`Net Delta: ${portfolioGreeks.netDelta}`);
   * console.log(`Net Theta: ${portfolioGreeks.netTheta} (daily decay)`);
   * ```
   */
  public calculatePortfolioGreeks(
    positions: Array<{
      securityId: string;
      quantity: number; // Positive for long, negative for short
      strike: number;
      expiryDate: Date | string;
      optionType: OptionKind;
      impliedVolatility?: number;
    }>,
    currentSpots: Record<string, number>,
  ): {
    netDelta: number;
    netGamma: number;
    netTheta: number;
    netVega: number;
    netRho: number;
    positionBreakdown: Array<{
      securityId: string;
      quantity: number;
      greeks: Greeks;
      totalDelta: number;
      totalTheta: number;
    }>;
  } {
    let netDelta = 0;
    let netGamma = 0;
    let netTheta = 0;
    let netVega = 0;
    let netRho = 0;

    const positionBreakdown = positions.map((position) => {
      // Get underlying spot price (default to 0 if not found)
      const spotPrice = currentSpots[position.securityId] ?? 0;

      const greeksResult = this.calculate({
        spotPrice,
        strike: position.strike,
        expiryDate: position.expiryDate,
        riskFreeRate: this.defaultRiskFreeRate,
        impliedVolatility:
          position.impliedVolatility ?? this.defaultImpliedVolatility,
        optionType: position.optionType,
      });

      const { greeks } = greeksResult;

      // Multiply by quantity to get total position Greeks
      const totalDelta = greeks.delta * position.quantity;
      const totalTheta = greeks.theta * position.quantity;

      // Accumulate net Greeks
      netDelta += totalDelta;
      netGamma += greeks.gamma * Math.abs(position.quantity);
      netTheta += totalTheta;
      netVega += greeks.vega * Math.abs(position.quantity);
      netRho += greeks.rho * Math.abs(position.quantity);

      return {
        securityId: position.securityId,
        quantity: position.quantity,
        greeks,
        totalDelta,
        totalTheta,
      };
    });

    return {
      netDelta,
      netGamma,
      netTheta,
      netVega,
      netRho,
      positionBreakdown,
    };
  }

  /**
   * Update default risk-free rate.
   */
  public setRiskFreeRate(rate: number): void {
    this.defaultRiskFreeRate = rate;
  }

  /**
   * Update default implied volatility.
   */
  public setImpliedVolatility(iv: number): void {
    this.defaultImpliedVolatility = iv;
  }
}
