/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type InxEstimatorRequest = {
    /**
     * Exchange standard identification for each scrip
     */
    securityId: string;
    /**
     * Price at which order is placed
     */
    price: string;
    /**
     * Number of shares (fractional supported)
     */
    quantity: string;
    /**
     * Transaction type - BUY(B) or SELL(S)
     */
    transactionType: string;
};

