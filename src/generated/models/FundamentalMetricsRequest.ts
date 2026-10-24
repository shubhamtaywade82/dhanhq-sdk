/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type FundamentalMetricsRequest = {
    /**
     * Exchange standard ID for each security
     * For eg. "1333"
     */
    securityId: string;
    /**
     * | **Enums** | **Exchange** | **Segment**  |
     * |-----------|--------------|--------------|
     * | NSE_EQ    | NSE          | Equity Cash  |
     * | BSE_EQ    | BSE          | Equity Cash  |
     */
    exchangeSegment: FundamentalMetricsRequest.exchangeSegment;
    /**
     * | **Enums** | **Description** |
     * |-----------|------------------|
     * | EQUITY    | Equity           |
     */
    instrument: FundamentalMetricsRequest.instrument;
    metrics: Array<'CO' | 'RATIOS' | 'SHP'>;
};
export namespace FundamentalMetricsRequest {
    /**
     * | **Enums** | **Exchange** | **Segment**  |
     * |-----------|--------------|--------------|
     * | NSE_EQ    | NSE          | Equity Cash  |
     * | BSE_EQ    | BSE          | Equity Cash  |
     */
    export enum exchangeSegment {
        NSE_EQ = 'NSE_EQ',
        BSE_EQ = 'BSE_EQ',
    }
    /**
     * | **Enums** | **Description** |
     * |-----------|------------------|
     * | EQUITY    | Equity           |
     */
    export enum instrument {
        EQUITY = 'EQUITY',
    }
}

