/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * List of orders to place
 */
export type MultiOrderItemRequest = {
    /**
     * Sequence number to identify order in the batch
     */
    sequence: string;
    /**
     * The user/partner generated id for tracking back
     */
    correlationId?: string;
    /**
     * Signifies the type of transaction whether it's BUY or SELL
     */
    transactionType: MultiOrderItemRequest.transactionType;
    /**
     * Exchange segment for the order
     */
    exchangeSegment: MultiOrderItemRequest.exchangeSegment;
    /**
     * Product type for the order
     */
    productType?: MultiOrderItemRequest.productType;
    /**
     * Order type for the order
     */
    orderType?: MultiOrderItemRequest.orderType;
    /**
     * Validity of the order
     */
    validity?: MultiOrderItemRequest.validity;
    /**
     * Exchange standard identification for each scrip
     */
    securityId?: string;
    /**
     * Number of shares or lots
     */
    quantity?: number;
    /**
     * Flag to inform that the order placed is After Market Order
     */
    afterMarketOrder?: boolean;
    /**
     * Flag to inform after what time AMO is pumped
     */
    amoTime?: MultiOrderItemRequest.amoTime;
    /**
     * Price at which the order is requested to execute
     */
    price?: number;
    /**
     * Price at which the order is triggered
     */
    triggerPrice?: number;
    /**
     * Number shares visible in the market depth
     */
    disclosedQuantity?: number;
};
export namespace MultiOrderItemRequest {
    /**
     * Signifies the type of transaction whether it's BUY or SELL
     */
    export enum transactionType {
        BUY = 'BUY',
        SELL = 'SELL',
    }
    /**
     * Exchange segment for the order
     */
    export enum exchangeSegment {
        NSE_EQ = 'NSE_EQ',
        NSE_FNO = 'NSE_FNO',
        NSE_COMM = 'NSE_COMM',
        BSE_EQ = 'BSE_EQ',
        BSE_FNO = 'BSE_FNO',
        MCX_COMM = 'MCX_COMM',
    }
    /**
     * Product type for the order
     */
    export enum productType {
        CNC = 'CNC',
        INTRADAY = 'INTRADAY',
        MARGIN = 'MARGIN',
        MTF = 'MTF',
    }
    /**
     * Order type for the order
     */
    export enum orderType {
        LIMIT = 'LIMIT',
        MARKET = 'MARKET',
        STOP_LOSS = 'STOP_LOSS',
        STOP_LOSS_MARKET = 'STOP_LOSS_MARKET',
    }
    /**
     * Validity of the order
     */
    export enum validity {
        DAY = 'DAY',
        IOC = 'IOC',
    }
    /**
     * Flag to inform after what time AMO is pumped
     */
    export enum amoTime {
        OPEN = 'OPEN',
        OPEN_30 = 'OPEN_30',
        OPEN_60 = 'OPEN_60',
        PRE_OPEN = 'PRE_OPEN',
    }
}

