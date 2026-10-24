/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TechnicalMetricsRequest = {
    /**
     * Exchange standard ID for each security
     * For eg. "1333"
     */
    securityId: string;
    /**
     * | **Enums**    | **Exchange** | **Segment**       |
     * |--------------|--------------|-------------------|
     * | NSE_EQ       | NSE          | Equity Cash       |
     * | IDX_I        | INDEX        | Indices           |
     */
    exchangeSegment: TechnicalMetricsRequest.exchangeSegment;
    /**
     * | **Enums** | **Description**        |
     * |-----------|-------------------------|
     * | INDEX     | Index                   |
     * | EQUITY    | Equity                  |
     */
    instrument: TechnicalMetricsRequest.instrument;
    /**
     * Candle size used to compute all indicators in this request.
     * **Note** : For intraday timeframes (1, 5, 15), indicators use candles from the current trading session only.
     *
     * | **Value** | **Type**  | **Description**                                           |
     * |-----------|-----------|------------------------------------------------------------|
     * | 1         | Intraday  | 1-minute candles                                           |
     * | 5         | Intraday  | 5-minute candles                                           |
     * | 15        | Intraday  | 15-minute candles                                          |
     * | D         | Daily     | End-of-day daily candles. Default for positional analysis. |
     */
    timeframe: TechnicalMetricsRequest.timeframe;
    /**
     * Array of indicator identifiers to fetch. Only the indicators passed here are computed and returned.
     * For eg. [ "SMA_20", "RSI_14", "MACD_HIST" ]
     *
     * **Moving Averages**
     *
     * | **Identifier** | **Description**                       |
     * |-----------------|----------------------------------------|
     * | SMA_5           | Simple Moving Average — 5-period       |
     * | SMA_10          | Simple Moving Average — 10-period      |
     * | SMA_20          | Simple Moving Average — 20-period      |
     * | SMA_50          | Simple Moving Average — 50-period      |
     * | SMA_100         | Simple Moving Average — 100-period     |
     * | SMA_200         | Simple Moving Average — 200-period     |
     * | EMA_5           | Exponential Moving Average — 5-period  |
     * | EMA_10          | Exponential Moving Average — 10-period |
     * | EMA_20          | Exponential Moving Average — 20-period |
     * | EMA_50          | Exponential Moving Average — 50-period |
     * | EMA_100         | Exponential Moving Average — 100-period|
     * | EMA_200         | Exponential Moving Average — 200-period|
     *
     * **Momentum / Oscillators**
     *
     * | **Identifier** | **Description**                                           | **Fixed Parameters**         |
     * |-----------------|-------------------------------------------------------------|-------------------------------|
     * | RSI_14          | Relative Strength Index                                      | Period: 14                    |
     * | MACD_HIST       | MACD histogram (MACD line minus Signal line)                 | Fast: 12 / Slow: 26 / Signal: 9|
     * | STOCH           | Stochastic Oscillator                                        | K: 9 / D: 6                    |
     * | STOCHRSI_14     | Stochastic RSI                                               | Period: 14                    |
     * | ATR_14          | Average True Range                                           | Period: 14                    |
     * | ADX_14          | Average Directional Index — trend strength, not direction    | Period: 14                    |
     * | UO              | Ultimate Oscillator                                          | Periods: 7 / 14 / 28          |
     * | ROC             | Rate of Change                                               | Period: 12                    |
     * | WILLR           | Williams %R                                                  | Period: 14                    |
     *
     * **Pivot Points**
     *
     * **Note** : Pivot levels always use the previous session's OHLC regardless of the timeframe in the request.
     *
     * | **Identifier**  | **Description**                                                                                     |
     * |------------------|-------------------------------------------------------------------------------------------------------|
     * | PIVOT_CLASSIC    | Standard floor pivot. Levels computed from previous session OHLC.                                     |
     * | PIVOT_FIBONACCI  | Fibonacci ratios applied to the pivot range.                                                           |
     * | PIVOT_CAMARILLA  | Tighter intraday levels derived from close and previous range.                                        |
     *
     *
     */
    indicators: Array<string>;
};
export namespace TechnicalMetricsRequest {
    /**
     * | **Enums**    | **Exchange** | **Segment**       |
     * |--------------|--------------|-------------------|
     * | NSE_EQ       | NSE          | Equity Cash       |
     * | IDX_I        | INDEX        | Indices           |
     */
    export enum exchangeSegment {
        NSE_EQ = 'NSE_EQ',
        IDX_I = 'IDX_I',
    }
    /**
     * | **Enums** | **Description**        |
     * |-----------|-------------------------|
     * | INDEX     | Index                   |
     * | EQUITY    | Equity                  |
     */
    export enum instrument {
        INDEX = 'INDEX',
        EQUITY = 'EQUITY',
    }
    /**
     * Candle size used to compute all indicators in this request.
     * **Note** : For intraday timeframes (1, 5, 15), indicators use candles from the current trading session only.
     *
     * | **Value** | **Type**  | **Description**                                           |
     * |-----------|-----------|------------------------------------------------------------|
     * | 1         | Intraday  | 1-minute candles                                           |
     * | 5         | Intraday  | 5-minute candles                                           |
     * | 15        | Intraday  | 15-minute candles                                          |
     * | D         | Daily     | End-of-day daily candles. Default for positional analysis. |
     */
    export enum timeframe {
        _1 = '1',
        _5 = '5',
        _15 = '15',
        D = 'D',
    }
}

