/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TopInstrumentsRequest = {
    /**
     * | **Enums** | **Description**                      |
     * |-----------|---------------------------------------|
     * | NSE_FNO   | NSE Futures and Options segment.       |
     * | BSE_FNO   | BSE Futures and Options segment.       |
     * | NSE_COMM  | NSE Commodity Derivatives segment.      |
     * | MCX_COMM  | MCX Commodity Derivatives segment.      |
     * | NSE_EQ    | NSE Equity segment.                    |
     * | BSE_EQ    | BSE Equity segment.                    |
     */
    exchangeSegment: TopInstrumentsRequest.exchangeSegment;
    /**
     * Instrument types to include in the result. Minimum one value is required. All values must belong to the same group (options, futures, or equity) - they cannot be mixed.
     */
    instrument: Array<'OPTIDX' | 'OPTSTK' | 'OPTFUT' | 'FUTIDX' | 'FUTSTK' | 'FUTCOM' | 'EQUITY'>;
    /**
     * Ranking category to apply. Supported categories depend on the selected instrument.
     *
     * | **Category**   | **Applicable To** | **Description**                                                             |
     * |-----------------|--------------------|-------------------------------------------------------------------------------|
     * | HIGHEST_OI      | Options            | Option contracts with the highest current open interest.                       |
     * | OI_GAINERS      | Options, Futures   | Derivative contracts with the highest positive percentage change in open interest. |
     * | OI_LOSERS       | Options, Futures   | Derivative contracts with the highest decline in open interest by percentage.  |
     * | TOP_VOLUME      | Options, Futures   | Derivative contracts with the highest traded volume during the current session. |
     * | PRICE_GAINERS   | Stocks             | Equity instruments with the highest positive percentage price change.          |
     * | PRICE_LOSERS    | Stocks             | Equity instruments with the highest negative percentage price change.         |
     */
    category: TopInstrumentsRequest.category;
    /**
     * Expiry date of the derivative contracts in YYYY-MM-DD format. Required when instrument is an option or future contract. Optional and ignored when instrument is EQUITY.
     * For eg. "2026-07-28"
     */
    expiry?: string;
    /**
     * Stock universe within which instruments are ranked. Required when instrument is EQUITY; ignored otherwise (its presence or absence has no effect for options/futures).
     *
     * | **Enums**              | **Description**                                                        |
     * |--------------------------|-------------------------------------------------------------------------|
     * | ALL                      | All supported equity instruments in the selected exchange segment.       |
     * | FNO_STOCKS               | Equity instruments whose derivatives are available in the F&O segment.  |
     * | NIFTY_50                 | Equity constituents of the Nifty 50 index.                              |
     * | NIFTY_BANK               | Equity constituents of the Nifty Bank index.                            |
     * | FINNIFTY                 | Equity constituents of the Nifty Financial Services (FinNifty) index.   |
     * | INDIA_VIX                | Equity constituents of the India VIX index.                             |
     * | NIFTY_MIDCAP             | Equity constituents of the Nifty Midcap index.                          |
     * | NIFTY_NEXT_50            | Equity constituents of the Nifty Next 50 index.                         |
     * | NIFTY_SMALLCAP_50        | Equity constituents of the Nifty Smallcap 50 index.                     |
     * | NIFTY_MID_CAP_50         | Equity constituents of the Nifty Midcap 50 index.                       |
     * | NIFTY_100                | Equity constituents of the Nifty 100 index.                             |
     * | NIFTY_200                | Equity constituents of the Nifty 200 index.                             |
     * | NIFTY_500                | Equity constituents of the Nifty 500 index.                             |
     * | NIFTY_MIDCAP_100         | Equity constituents of the Nifty Midcap 100 index.                      |
     * | NIFTY_MIDCAP_150         | Equity constituents of the Nifty Midcap 150 index.                      |
     * | NIFTY_SMALLCAP_100       | Equity constituents of the Nifty Smallcap 100 index.                    |
     * | NIFTY_SMALLCAP_250       | Equity constituents of the Nifty Smallcap 250 index.                    |
     * | NIFTY_MICROCAP_250       | Equity constituents of the Nifty Microcap 250 index.                    |
     * | NIFTY_AUTO               | Equity constituents of the Nifty Auto index.                            |
     * | NIFTY_PRIVATE_BANK       | Equity constituents of the Nifty Private Bank index.                    |
     * | NIFTY_FMCG               | Equity constituents of the Nifty FMCG index.                            |
     * | NIFTY_ENERGY             | Equity constituents of the Nifty Energy index.                          |
     * | NIFTY_INFRA              | Equity constituents of the Nifty Infrastructure index.                  |
     * | NIFTY_IT                 | Equity constituents of the Nifty IT index.                              |
     * | NIFTY_MEDIA              | Equity constituents of the Nifty Media index.                           |
     * | NIFTY_METAL              | Equity constituents of the Nifty Metal index.                           |
     * | NIFTY_MNC                | Equity constituents of the Nifty MNC index.                             |
     * | NIFTY_PHARMA             | Equity constituents of the Nifty Pharma index.                          |
     * | NIFTY_PSU_BANK           | Equity constituents of the Nifty PSU Bank index.                        |
     * | NIFTY_REALTY             | Equity constituents of the Nifty Realty index.                          |
     * | NIFTY_SERVICE_SECTOR     | Equity constituents of the Nifty Services Sector index.                 |
     * | NIFTY_CUNSUMPTION        | Equity constituents of the Nifty Consumption index.                     |
     * | GIFT_NIFTY               | Equity constituents of the GIFT Nifty index.                            |
     * | SENSEX                   | Equity constituents of the Sensex index.                                |
     * | BSE_100                  | Equity constituents of the BSE 100 index.                               |
     * | BSE_200                  | Equity constituents of the BSE 200 index.                               |
     * | BSE_500                  | Equity constituents of the BSE 500 index.                               |
     * | BSE_150_MIDCAP           | Equity constituents of the BSE 150 MidCap index.                        |
     * | BSE_250_SMALLCAP         | Equity constituents of the BSE 250 SmallCap index.                      |
     * | BSE_250_LARGE_MID        | Equity constituents of the BSE 250 Large MidCap index.                  |
     * | BSE_400_MID_SMALL        | Equity constituents of the BSE 400 MidSmallCap index.                   |
     * | BSE_BANKEX               | Equity constituents of the BSE Bankex index.                            |
     * | BSE_AUTO                 | Equity constituents of the BSE Auto index.                              |
     * | BSE_CAPITAL_GOODS        | Equity constituents of the BSE Capital Goods index.                     |
     * | BSE_CONSUMER_DURABLES    | Equity constituents of the BSE Consumer Durables index.                 |
     * | BSE_ENERGY               | Equity constituents of the BSE Energy index.                           |
     * | BSE_FINANCE              | Equity constituents of the BSE Finance index.                          |
     * | BSE_FMCG                 | Equity constituents of the BSE FMCG index.                             |
     * | BSE_HEALTHCARE           | Equity constituents of the BSE Healthcare index.                       |
     * | BSE_INDIA_MFG            | Equity constituents of the BSE India Manufacturing index.               |
     * | BSE_INDUSTRIALS          | Equity constituents of the BSE Industrials index.                       |
     * | BSE_IPO                  | Equity constituents of the BSE IPO index.                               |
     * | BSE_IT                   | Equity constituents of the BSE IT index.                                |
     * | BSE_METALS               | Equity constituents of the BSE Metal index.                            |
     * | BSE_OIL_AND_GAS          | Equity constituents of the BSE Oil & Gas index.                        |
     * | BSE_POWER                | Equity constituents of the BSE Power index.                            |
     * | BSE_PSU                  | Equity constituents of the BSE PSU index.                              |
     * | BSE_TELECOM              | Equity constituents of the BSE Telecom index.                          |
     */
    universe?: TopInstrumentsRequest.universe;
    /**
     * Maximum number of instruments to return. Allowed range is 1 to 100.
     * For eg. 20
     */
    limit: number;
};
export namespace TopInstrumentsRequest {
    /**
     * | **Enums** | **Description**                      |
     * |-----------|---------------------------------------|
     * | NSE_FNO   | NSE Futures and Options segment.       |
     * | BSE_FNO   | BSE Futures and Options segment.       |
     * | NSE_COMM  | NSE Commodity Derivatives segment.      |
     * | MCX_COMM  | MCX Commodity Derivatives segment.      |
     * | NSE_EQ    | NSE Equity segment.                    |
     * | BSE_EQ    | BSE Equity segment.                    |
     */
    export enum exchangeSegment {
        NSE_FNO = 'NSE_FNO',
        BSE_FNO = 'BSE_FNO',
        NSE_COMM = 'NSE_COMM',
        MCX_COMM = 'MCX_COMM',
        NSE_EQ = 'NSE_EQ',
        BSE_EQ = 'BSE_EQ',
    }
    /**
     * Ranking category to apply. Supported categories depend on the selected instrument.
     *
     * | **Category**   | **Applicable To** | **Description**                                                             |
     * |-----------------|--------------------|-------------------------------------------------------------------------------|
     * | HIGHEST_OI      | Options            | Option contracts with the highest current open interest.                       |
     * | OI_GAINERS      | Options, Futures   | Derivative contracts with the highest positive percentage change in open interest. |
     * | OI_LOSERS       | Options, Futures   | Derivative contracts with the highest decline in open interest by percentage.  |
     * | TOP_VOLUME      | Options, Futures   | Derivative contracts with the highest traded volume during the current session. |
     * | PRICE_GAINERS   | Stocks             | Equity instruments with the highest positive percentage price change.          |
     * | PRICE_LOSERS    | Stocks             | Equity instruments with the highest negative percentage price change.         |
     */
    export enum category {
        HIGHEST_OI = 'HIGHEST_OI',
        OI_GAINERS = 'OI_GAINERS',
        OI_LOSERS = 'OI_LOSERS',
        TOP_VOLUME = 'TOP_VOLUME',
        PRICE_GAINERS = 'PRICE_GAINERS',
        PRICE_LOSERS = 'PRICE_LOSERS',
    }
    /**
     * Stock universe within which instruments are ranked. Required when instrument is EQUITY; ignored otherwise (its presence or absence has no effect for options/futures).
     *
     * | **Enums**              | **Description**                                                        |
     * |--------------------------|-------------------------------------------------------------------------|
     * | ALL                      | All supported equity instruments in the selected exchange segment.       |
     * | FNO_STOCKS               | Equity instruments whose derivatives are available in the F&O segment.  |
     * | NIFTY_50                 | Equity constituents of the Nifty 50 index.                              |
     * | NIFTY_BANK               | Equity constituents of the Nifty Bank index.                            |
     * | FINNIFTY                 | Equity constituents of the Nifty Financial Services (FinNifty) index.   |
     * | INDIA_VIX                | Equity constituents of the India VIX index.                             |
     * | NIFTY_MIDCAP             | Equity constituents of the Nifty Midcap index.                          |
     * | NIFTY_NEXT_50            | Equity constituents of the Nifty Next 50 index.                         |
     * | NIFTY_SMALLCAP_50        | Equity constituents of the Nifty Smallcap 50 index.                     |
     * | NIFTY_MID_CAP_50         | Equity constituents of the Nifty Midcap 50 index.                       |
     * | NIFTY_100                | Equity constituents of the Nifty 100 index.                             |
     * | NIFTY_200                | Equity constituents of the Nifty 200 index.                             |
     * | NIFTY_500                | Equity constituents of the Nifty 500 index.                             |
     * | NIFTY_MIDCAP_100         | Equity constituents of the Nifty Midcap 100 index.                      |
     * | NIFTY_MIDCAP_150         | Equity constituents of the Nifty Midcap 150 index.                      |
     * | NIFTY_SMALLCAP_100       | Equity constituents of the Nifty Smallcap 100 index.                    |
     * | NIFTY_SMALLCAP_250       | Equity constituents of the Nifty Smallcap 250 index.                    |
     * | NIFTY_MICROCAP_250       | Equity constituents of the Nifty Microcap 250 index.                    |
     * | NIFTY_AUTO               | Equity constituents of the Nifty Auto index.                            |
     * | NIFTY_PRIVATE_BANK       | Equity constituents of the Nifty Private Bank index.                    |
     * | NIFTY_FMCG               | Equity constituents of the Nifty FMCG index.                            |
     * | NIFTY_ENERGY             | Equity constituents of the Nifty Energy index.                          |
     * | NIFTY_INFRA              | Equity constituents of the Nifty Infrastructure index.                  |
     * | NIFTY_IT                 | Equity constituents of the Nifty IT index.                              |
     * | NIFTY_MEDIA              | Equity constituents of the Nifty Media index.                           |
     * | NIFTY_METAL              | Equity constituents of the Nifty Metal index.                           |
     * | NIFTY_MNC                | Equity constituents of the Nifty MNC index.                             |
     * | NIFTY_PHARMA             | Equity constituents of the Nifty Pharma index.                          |
     * | NIFTY_PSU_BANK           | Equity constituents of the Nifty PSU Bank index.                        |
     * | NIFTY_REALTY             | Equity constituents of the Nifty Realty index.                          |
     * | NIFTY_SERVICE_SECTOR     | Equity constituents of the Nifty Services Sector index.                 |
     * | NIFTY_CUNSUMPTION        | Equity constituents of the Nifty Consumption index.                     |
     * | GIFT_NIFTY               | Equity constituents of the GIFT Nifty index.                            |
     * | SENSEX                   | Equity constituents of the Sensex index.                                |
     * | BSE_100                  | Equity constituents of the BSE 100 index.                               |
     * | BSE_200                  | Equity constituents of the BSE 200 index.                               |
     * | BSE_500                  | Equity constituents of the BSE 500 index.                               |
     * | BSE_150_MIDCAP           | Equity constituents of the BSE 150 MidCap index.                        |
     * | BSE_250_SMALLCAP         | Equity constituents of the BSE 250 SmallCap index.                      |
     * | BSE_250_LARGE_MID        | Equity constituents of the BSE 250 Large MidCap index.                  |
     * | BSE_400_MID_SMALL        | Equity constituents of the BSE 400 MidSmallCap index.                   |
     * | BSE_BANKEX               | Equity constituents of the BSE Bankex index.                            |
     * | BSE_AUTO                 | Equity constituents of the BSE Auto index.                              |
     * | BSE_CAPITAL_GOODS        | Equity constituents of the BSE Capital Goods index.                     |
     * | BSE_CONSUMER_DURABLES    | Equity constituents of the BSE Consumer Durables index.                 |
     * | BSE_ENERGY               | Equity constituents of the BSE Energy index.                           |
     * | BSE_FINANCE              | Equity constituents of the BSE Finance index.                          |
     * | BSE_FMCG                 | Equity constituents of the BSE FMCG index.                             |
     * | BSE_HEALTHCARE           | Equity constituents of the BSE Healthcare index.                       |
     * | BSE_INDIA_MFG            | Equity constituents of the BSE India Manufacturing index.               |
     * | BSE_INDUSTRIALS          | Equity constituents of the BSE Industrials index.                       |
     * | BSE_IPO                  | Equity constituents of the BSE IPO index.                               |
     * | BSE_IT                   | Equity constituents of the BSE IT index.                                |
     * | BSE_METALS               | Equity constituents of the BSE Metal index.                            |
     * | BSE_OIL_AND_GAS          | Equity constituents of the BSE Oil & Gas index.                        |
     * | BSE_POWER                | Equity constituents of the BSE Power index.                            |
     * | BSE_PSU                  | Equity constituents of the BSE PSU index.                              |
     * | BSE_TELECOM              | Equity constituents of the BSE Telecom index.                          |
     */
    export enum universe {
        ALL = 'ALL',
        FNO_STOCKS = 'FNO_STOCKS',
        NIFTY_50 = 'NIFTY_50',
        NIFTY_BANK = 'NIFTY_BANK',
        FINNIFTY = 'FINNIFTY',
        INDIA_VIX = 'INDIA_VIX',
        NIFTY_MIDCAP = 'NIFTY_MIDCAP',
        NIFTY_NEXT_50 = 'NIFTY_NEXT_50',
        NIFTY_SMALLCAP_50 = 'NIFTY_SMALLCAP_50',
        NIFTY_MID_CAP_50 = 'NIFTY_MID_CAP_50',
        NIFTY_100 = 'NIFTY_100',
        NIFTY_200 = 'NIFTY_200',
        NIFTY_500 = 'NIFTY_500',
        NIFTY_MIDCAP_100 = 'NIFTY_MIDCAP_100',
        NIFTY_MIDCAP_150 = 'NIFTY_MIDCAP_150',
        NIFTY_SMALLCAP_100 = 'NIFTY_SMALLCAP_100',
        NIFTY_SMALLCAP_250 = 'NIFTY_SMALLCAP_250',
        NIFTY_MICROCAP_250 = 'NIFTY_MICROCAP_250',
        NIFTY_AUTO = 'NIFTY_AUTO',
        NIFTY_PRIVATE_BANK = 'NIFTY_PRIVATE_BANK',
        NIFTY_FMCG = 'NIFTY_FMCG',
        NIFTY_ENERGY = 'NIFTY_ENERGY',
        NIFTY_INFRA = 'NIFTY_INFRA',
        NIFTY_IT = 'NIFTY_IT',
        NIFTY_MEDIA = 'NIFTY_MEDIA',
        NIFTY_METAL = 'NIFTY_METAL',
        NIFTY_MNC = 'NIFTY_MNC',
        NIFTY_PHARMA = 'NIFTY_PHARMA',
        NIFTY_PSU_BANK = 'NIFTY_PSU_BANK',
        NIFTY_REALTY = 'NIFTY_REALTY',
        NIFTY_SERVICE_SECTOR = 'NIFTY_SERVICE_SECTOR',
        NIFTY_CUNSUMPTION = 'NIFTY_CUNSUMPTION',
        GIFT_NIFTY = 'GIFT_NIFTY',
        SENSEX = 'SENSEX',
        BSE_100 = 'BSE_100',
        BSE_200 = 'BSE_200',
        BSE_500 = 'BSE_500',
        BSE_150_MIDCAP = 'BSE_150_MIDCAP',
        BSE_250_SMALLCAP = 'BSE_250_SMALLCAP',
        BSE_250_LARGE_MID = 'BSE_250_LARGE_MID',
        BSE_400_MID_SMALL = 'BSE_400_MID_SMALL',
        BSE_BANKEX = 'BSE_BANKEX',
        BSE_AUTO = 'BSE_AUTO',
        BSE_CAPITAL_GOODS = 'BSE_CAPITAL_GOODS',
        BSE_CONSUMER_DURABLES = 'BSE_CONSUMER_DURABLES',
        BSE_ENERGY = 'BSE_ENERGY',
        BSE_FINANCE = 'BSE_FINANCE',
        BSE_FMCG = 'BSE_FMCG',
        BSE_HEALTHCARE = 'BSE_HEALTHCARE',
        BSE_INDIA_MFG = 'BSE_INDIA_MFG',
        BSE_INDUSTRIALS = 'BSE_INDUSTRIALS',
        BSE_IPO = 'BSE_IPO',
        BSE_IT = 'BSE_IT',
        BSE_METALS = 'BSE_METALS',
        BSE_OIL_AND_GAS = 'BSE_OIL_AND_GAS',
        BSE_POWER = 'BSE_POWER',
        BSE_PSU = 'BSE_PSU',
        BSE_TELECOM = 'BSE_TELECOM',
    }
}

