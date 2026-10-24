/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChartsResponse } from '../models/ChartsResponse';
import type { FundamentalMetricsRequest } from '../models/FundamentalMetricsRequest';
import type { FundamentalMetricsResponse } from '../models/FundamentalMetricsResponse';
import type { HistoricalChartsRequest } from '../models/HistoricalChartsRequest';
import type { IntradayChartsRequest } from '../models/IntradayChartsRequest';
import type { NewsHeadlineRequest } from '../models/NewsHeadlineRequest';
import type { NewsHeadlineResponse } from '../models/NewsHeadlineResponse';
import type { OptionChartRequest } from '../models/OptionChartRequest';
import type { OptionChartResponse } from '../models/OptionChartResponse';
import type { TechnicalMetricsRequest } from '../models/TechnicalMetricsRequest';
import type { TechnicalMetricsResponse } from '../models/TechnicalMetricsResponse';
import type { TopInstrumentsRequest } from '../models/TopInstrumentsRequest';
import type { TopInstrumentsResponse } from '../models/TopInstrumentsResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DataApiSService {
    /**
     * technical data
     * Fetch technical indicator values for an instrument. Pass the indicators you need - only those are computed and returned. All values are point-in-time as of the latest closed candle for the requested timeframe.
     * @param accessToken
     * @param requestBody
     * @returns TechnicalMetricsResponse Successful operation
     * @throws ApiError
     */
    public static technicalMetrics(
        accessToken: string,
        requestBody: TechnicalMetricsRequest,
    ): CancelablePromise<TechnicalMetricsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/technical',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * live news headline
     * Fetch the latest news headlines as of now, filterable by category and stock, capped at limit (max 50) items.
     * @param accessToken
     * @param requestBody
     * @returns NewsHeadlineResponse Successful operation
     * @throws ApiError
     */
    public static newsHeadline(
        accessToken: string,
        requestBody: NewsHeadlineRequest,
    ): CancelablePromise<NewsHeadlineResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/newsheadline',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * market movers
     * Fetch top options, futures, and stocks ranked by open interest, traded volume, or price movement. Select the instrument type(s) and ranking category to retrieve the highest-ranked instruments.
     * @param accessToken
     * @param requestBody
     * @returns TopInstrumentsResponse Successful operation
     * @throws ApiError
     */
    public static marketMovers(
        accessToken: string,
        requestBody: TopInstrumentsRequest,
    ): CancelablePromise<TopInstrumentsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/marketmovers',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * company info
     * Fetch key company information for a single equity instrument, including company overview, valuation and profitability ratios, industry benchmarks, shareholding pattern, and key price and financial indicators.
     * @param accessToken
     * @param requestBody
     * @returns FundamentalMetricsResponse Successful operation
     * @throws ApiError
     */
    public static companyInfo(
        accessToken: string,
        requestBody: FundamentalMetricsRequest,
    ): CancelablePromise<FundamentalMetricsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/companyinfo',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * fetch expired option data
     * Fetch minute-wise rolling option chart data of expired contracts - including OHLC, volume, IV based on strike.
     * @param accessToken
     * @param requestBody
     * @returns OptionChartResponse Successful operation
     * @throws ApiError
     */
    public static optionchart(
        accessToken: string,
        requestBody: OptionChartRequest,
    ): CancelablePromise<OptionChartResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/charts/rollingoption',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * fetch OHLC for minute timeframe
     * Retrieve OHLC & Volume of minute candle for desired instrument for current day. This data available for all segments including futures & options.
     * @param accessToken
     * @param requestBody
     * @returns ChartsResponse Successful operation
     * @throws ApiError
     */
    public static intradaycharts(
        accessToken: string,
        requestBody: IntradayChartsRequest,
    ): CancelablePromise<ChartsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/charts/intraday',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * fetch OHLC for daily candle
     * Retrieve OHLC & Volume of daily candle for desired instrument. The data for any scrip is available back upto the date of its inception.
     * @param accessToken
     * @param requestBody
     * @returns ChartsResponse Successful operation
     * @throws ApiError
     */
    public static historicalcharts(
        accessToken: string,
        requestBody: HistoricalChartsRequest,
    ): CancelablePromise<ChartsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/charts/historical',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
