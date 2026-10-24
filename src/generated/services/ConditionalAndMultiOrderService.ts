/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AlertModifyRequest } from '../models/AlertModifyRequest';
import type { AlertOrderRequest } from '../models/AlertOrderRequest';
import type { AlertOrderResponse } from '../models/AlertOrderResponse';
import type { GetAlertResponse } from '../models/GetAlertResponse';
import type { MultiOrderRequest } from '../models/MultiOrderRequest';
import type { MultiOrderResponse } from '../models/MultiOrderResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ConditionalAndMultiOrderService {
    /**
     * get conditional order by ID
     * Retrieve the status and detailed conditional triggers for a specific alert order by its unique identification
     * @param accessToken
     * @param alertId
     * @returns GetAlertResponse Successful operation
     * @throws ApiError
     */
    public static getAlertOrder(
        accessToken: string,
        alertId: string,
    ): CancelablePromise<GetAlertResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/alerts/orders/{alertId}',
            path: {
                'alertId': alertId,
            },
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * modify conditional order
     * Modify an existing alert order by updating its conditional trigger logic and/or the associated order execution parameters.
     * @param accessToken
     * @param alertId
     * @param requestBody
     * @returns AlertOrderResponse Successful operation
     * @throws ApiError
     */
    public static modifyAlertOrder(
        accessToken: string,
        alertId: string,
        requestBody: AlertModifyRequest,
    ): CancelablePromise<AlertOrderResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/alerts/orders/{alertId}',
            path: {
                'alertId': alertId,
            },
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * delete conditional order
     * Delete an existing conditional trigger using its unique identifier.
     * @param accessToken
     * @param alertId
     * @returns AlertOrderResponse Successful operation
     * @throws ApiError
     */
    public static delAlertOrder(
        accessToken: string,
        alertId: string,
    ): CancelablePromise<AlertOrderResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/alerts/orders/{alertId}',
            path: {
                'alertId': alertId,
            },
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * get all conditional orders
     * Retrieve a list of all conditional triggers for the authenticated account, along with their current status and configuration details.
     * @param accessToken
     * @returns GetAlertResponse Successful operation
     * @throws ApiError
     */
    public static getAllAlertOrders(
        accessToken: string,
    ): CancelablePromise<Array<GetAlertResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/alerts/orders',
            headers: {
                'access-token': accessToken,
            },
        });
    }
    /**
     * place conditional order
     * The Conditional Trigger (Alerts) API lets you define conditions (price or technical indicators) that, when met, place one or multiple orders automatically on the user’s Dhan account. It supports multiple combinations of indicators and operators along with optional webhook callbacks.
     * **Notes** :
     * * Conditions are currently supported only for Equities and Indices.
     * * You can receive a postback update by providing a Webhook URL while generating the Access Token.
     * @param accessToken
     * @param requestBody
     * @returns AlertOrderResponse Successful operation
     * @throws ApiError
     */
    public static alertOrder(
        accessToken: string,
        requestBody: AlertOrderRequest,
    ): CancelablePromise<AlertOrderResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/alerts/orders',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * place multi order
     * Place a multi order directly without any conditions.
     * @param accessToken
     * @param requestBody
     * @returns MultiOrderResponse Successful operation
     * @throws ApiError
     */
    public static placeMultiOrder(
        accessToken: string,
        requestBody: MultiOrderRequest,
    ): CancelablePromise<MultiOrderResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/alerts/multi/orders',
            headers: {
                'access-token': accessToken,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
