/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * List of instruments ranked according to the selected category.
 */
export type TopInstrumentDetail = {
    /**
     * Exchange-standard security ID of the instrument.
     */
    securityId?: string;
    /**
     * Exchange and segment of the instrument.
     */
    exchangeSegment?: string;
    /**
     * Exchange trading symbol of the instrument.
     */
    tradingSymbol?: string;
    /**
     * Human-readable name of the instrument.
     */
    displayName?: string;
    /**
     * Instrument type of the security.
     */
    instrument?: string;
    /**
     * Expiry date in YYYY-MM-DD format. Returns null for stocks.
     */
    expiry?: string;
    /**
     * Strike price of the option contract. Returns null for futures and stocks.
     */
    strikePrice?: number;
    /**
     * Minimum permitted price movement of the instrument.
     */
    tickSize?: number;
    /**
     * Number of units in one market lot.
     */
    lotSize?: number;
    /**
     * Last traded price of the instrument.
     */
    ltp?: number;
    /**
     * Absolute price change from the previous close.
     */
    change?: number;
    /**
     * Percentage price change from the previous close.
     */
    changePercent?: number;
    /**
     * Total traded volume during the current session.
     */
    volume?: number;
    /**
     * Total traded value during the current session.
     */
    tradedValue?: number;
    /**
     * Security ID of the underlying instrument. Applicable to derivatives.
     */
    underlyingSecurityId?: string;
    /**
     * Last traded price of the underlying instrument. Applicable to derivatives.
     */
    underlyingLtp?: number;
    /**
     * Difference between futures LTP and underlying LTP. Returns null for options and stocks.
     */
    premiumDiscount?: number;
    /**
     * Futures premium or discount as a percentage of the underlying LTP. Returns null for options and stocks.
     */
    premiumDiscountPercent?: number;
    /**
     * Current outstanding open interest of the derivative contract. Returns null for stocks.
     */
    openInterest?: number;
    /**
     * Absolute change in open interest from the previous trading session. Returns null for stocks.
     */
    openInterestChange?: number;
    /**
     * Percentage change in open interest from the previous trading session. Returns null for stocks.
     */
    openInterestChangePercent?: number;
    /**
     * Put-call ratio for the applicable option universe. Returns null for futures and stocks.
     */
    putCallRatio?: number;
};

