/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type FundamentalMetricsResponse = {
    /**
     * Echoed from request
     */
    securityId?: string;
    /**
     * Single-element array containing the isin and requested section blocks.
     *
     * **Response Parameters — CO (Company Overview)**
     *
     * | **Parameters** | **Data Type** | **Description** | **Sample value** |
     * |-----------------|----------------|-------------------|--------------------|
     * | MARKET_CAP | String | Market capitalisation in Rs Cr. | 36318.4 |
     * | INDUSTRY | String | Specific industry in which the company operates. | Cement |
     * | SECTOR | String | Broad economic sector to which the company belongs. | Construction |
     * | DIVIDEND_YIELD | String | Annual dividend per share as a percentage of the current market price. | 0.21 |
     * | EPS | String | Earnings attributable to each outstanding equity share, based on the trailing twelve months. | 60.7 |
     * | EBITDA | String | Earnings before interest, tax, depreciation, and amortisation for the trailing twelve months, in ₹ crore. | 3278 |
     * | BOOK_VALUE | String | Latest book value per equity share, in ₹. | 958.52 |
     * | FIFTY_TWO_WEEK_HIGH | String | Highest price at which the security traded during the previous 52 weeks. | 1245 |
     * | FIFTY_TWO_WEEK_LOW | String | Lowest price at which the security traded during the previous 52 weeks. | 865.5 |
     *
     * **Response Parameters — RATIOS (Return Ratios)**
     *
     * | **Parameters** | **Data Type** | **Description** | **Sample value** |
     * |-----------------|----------------|-------------------|--------------------|
     * | PE_RATIO | String | Price-to-Earnings ratio of the company based on trailing twelve-month earnings. | 31.2 |
     * | PB_RATIO | String | Price-to-Book ratio of the company. | 2.01 |
     * | DEBT_TO_EQUITY | String | Ratio of the company's total debt to shareholders' equity. | 0.65 |
     * | PE_TO_SECTOR_PE | String | Ratio of the company's PE ratio to the average PE ratio of its sector. | 0.82 |
     * | ROE | String | Return on Equity, indicating how efficiently the company generates profit using shareholders' equity, expressed as a percentage. | 3.99 |
     * | ROCE | String | Return on Capital Employed, indicating how efficiently the company generates operating profit using the capital employed, expressed as a percentage. | 4.86 |
     * | INDUSTRY_EPS | String | Average earnings per share of companies operating in the same industry. | 42.6 |
     * | INDUSTRY_DEBT_TO_EQUITY | String | Average debt-to-equity ratio of companies operating in the same industry. | 0.85 |
     * | INDUSTRY_PB_RATIO | String | Average price-to-book ratio of companies operating in the same industry. | 4.2 |
     * | INDUSTRY_CURRENT_RATIO | String | Average current ratio of companies operating in the same industry. | 1.75 |
     * | INDUSTRY_DIVIDEND_YIELD | String | Average dividend yield of companies operating in the same industry, expressed as a percentage. | 1.4 |
     * | INDUSTRY_OPERATING_MARGIN | String | Average operating profit margin of companies operating in the same industry, expressed as a percentage. | 18.6 |
     *
     * **Response Parameters — SHP (Shareholding Pattern)**
     *
     * | **Parameters** | **Data Type** | **Description** | **Sample value** |
     * |-----------------|----------------|-------------------|--------------------|
     * | REPORTING_PERIOD | String | Latest quarter for which shareholding data is reported, in YYYYMM format. | 202603 |
     * | PROMOTER_HOLDING | String | Percentage of the company's total shares held by promoters and the promoter group. | 55.84 |
     * | DII_HOLDING | String | Percentage of the company's total shares held by domestic institutional investors. | 20.25 |
     * | CHANGE_IN_DII_HOLDING | String | Change in DII holding compared with the previous reported quarter, in percentage points. | 1.26 |
     * | FII_HOLDING | String | Percentage of the company's total shares held by foreign institutional investors. | 7.15 |
     * | CHANGE_IN_FII_HOLDING | String | Change in FII holding compared with the previous reported quarter, in percentage points. | -0.77 |
     * | PUBLIC_HOLDING | String | Percentage of the company's total shares held by public or retail shareholders. | 8.06 |
     */
    data?: Record<string, Record<string, any>>;
};

