/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TechnicalMetricsResponse = {
    /**
     * Echoed from request
     */
    securityId?: string;
    /**
     * Echoed from request
     */
    timeframe?: string;
    /**
     * | **Parameters** | **Data Type** | **Description** | **Sample value** |
     * |-----------------|----------------|-------------------|--------------------|
     * | data | Object | Keyed by indicator type. Only requested indicators are present. | { "SMA": [...], "RSI": {...} } |
     *
     * Note : SMA and EMA return an array of objects (one per requested period). All other indicators return a single object. PIVOT returns an object keyed by method name (Classic, Fibonacci, Camarilla).
     *
     * Note : action labels per indicator — SMA/EMA: Bullish / Bearish. RSI/STOCH/STOCHRSI/WILLR: Overbought / Oversold / Neutral. MACD: Bullish / Bearish. ATR: More Volatile / Less Volatile. ADX: Strong Trend / Weak Trend. UO: Bullish / Bearish. ROC: Uptrend And Accelerating / Decelerating / Downtrend And Accelerating / Decelerating.
     */
    data?: Record<string, Record<string, any>>;
};

