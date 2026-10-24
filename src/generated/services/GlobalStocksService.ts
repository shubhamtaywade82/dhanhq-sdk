/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { InxEstimatorRequest } from '../models/InxEstimatorRequest';
import type { InxEstimatorResponse } from '../models/InxEstimatorResponse';
import type { InxFundLimitResponse } from '../models/InxFundLimitResponse';
import type { InxHoldingResponse } from '../models/InxHoldingResponse';
import type { InxMarginResponse } from '../models/InxMarginResponse';
import type { InxMarketStatusResponse } from '../models/InxMarketStatusResponse';
import type { InxModifyRequest } from '../models/InxModifyRequest';
import type { InxOrderRequest } from '../models/InxOrderRequest';
import type { InxOrderResponse } from '../models/InxOrderResponse';
import type { InxTradeResponse } from '../models/InxTradeResponse';
import type { OrderStatusResponse } from '../models/OrderStatusResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class GlobalStocksService {
    /**
     * Get order by order ID
     * Retrieve a specific order by order ID.
     * @param accessToken
     * @param orderId
     * @returns InxOrderResponse Successful operation
     * @throws ApiError
     */
    public static getOrderByOrderId(
        accessToken: string,
        orderId: string,
    ): CancelablePromise<InxOrderResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/globalstocks/orders/{order-id}',
            path: {
                'order-id': orderId,
            },
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * Modify order
     * Modify an existing order.
     * @param accessToken
     * @param orderId
     * @param requestBody
     * @returns OrderStatusResponse Successful operation
     * @throws ApiError
     */
    public static modifyOrder(
        accessToken: string,
        orderId: string,
        requestBody: InxModifyRequest,
    ): CancelablePromise<OrderStatusResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/globalstocks/orders/{order-id}',
            path: {
                'order-id': orderId,
            },
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Cancel order
     * Cancel an existing order.
     * @param accessToken
     * @param orderId
     * @returns OrderStatusResponse Successful operation
     * @throws ApiError
     */
    public static cancelOrder(
        accessToken: string,
        orderId: string,
    ): CancelablePromise<OrderStatusResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/globalstocks/orders/{order-id}',
            path: {
                'order-id': orderId,
            },
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * Order estimator
     * Calculate order estimation.
     * @param accessToken
     * @param requestBody
     * @returns InxEstimatorResponse Successful operation
     * @throws ApiError
     */
    public static getOrderEstimator(
        accessToken: string,
        requestBody: InxEstimatorRequest,
    ): CancelablePromise<InxEstimatorResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/globalstocks/transEstimate',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get order book
     * Retrieve all orders placed.
     * @param accessToken
     * @returns InxOrderResponse Successful operation
     * @throws ApiError
     */
    public static getOrders(
        accessToken: string,
    ): CancelablePromise<Array<InxOrderResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/globalstocks/orders',
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * Place Order
     * Place a new order.
     * @param accessToken
     * @param requestBody
     * @returns OrderStatusResponse Successful operation
     * @throws ApiError
     */
    public static placeOrder(
        accessToken: string,
        requestBody: InxOrderRequest,
    ): CancelablePromise<OrderStatusResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/globalstocks/orders',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Margin Calculator
     * Calculate margin requirements.
     * @param accessToken
     * @param requestBody
     * @returns InxMarginResponse Successful operation
     * @throws ApiError
     */
    public static getKnowYourMargin(
        accessToken: string,
        requestBody: InxEstimatorRequest,
    ): CancelablePromise<InxMarginResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/globalstocks/margincalculator',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get past trades
     * Retrieve past trades.
     * @param accessToken
     * @returns InxTradeResponse Successful operation
     * @throws ApiError
     */
    public static getPastTrades(
        accessToken: string,
    ): CancelablePromise<Array<InxTradeResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/globalstocks/trades',
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * Get past trades by script
     * Retrieve past trades for a specific security.
     * @param accessToken
     * @param securityId
     * @returns InxTradeResponse Successful operation
     * @throws ApiError
     */
    public static getPastTradesByScript(
        accessToken: string,
        securityId: string,
    ): CancelablePromise<Array<InxTradeResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/globalstocks/trades/{security-id}',
            path: {
                'security-id': securityId,
            },
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * Get market status
     * Retrieve market status.
     * @param accessToken
     * @returns InxMarketStatusResponse Successful operation
     * @throws ApiError
     */
    public static getMarketStatus(
        accessToken: string,
    ): CancelablePromise<InxMarketStatusResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/globalstocks/marketstatus',
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * Get holdings
     * Retrieve holdings for the user.
     * @param accessToken
     * @returns InxHoldingResponse Successful operation
     * @throws ApiError
     */
    public static getHoldings(
        accessToken: string,
    ): CancelablePromise<Array<InxHoldingResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/globalstocks/holdings',
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * Get fund limit
     * Get fund limit details.
     * @param accessToken
     * @returns InxFundLimitResponse Successful operation
     * @throws ApiError
     */
    public static getFundLimit(
        accessToken: string,
    ): CancelablePromise<InxFundLimitResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/globalstocks/fundlimit',
            headers: {
                'access-token': accessToken,
            },
        });
    }
}
