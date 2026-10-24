/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type GetIPDetailsResponse = {
    /**
     * Date when secondary IP can be modified again (format: yyyy-MM-dd)
     */
    modifyDatePrimary?: string;
    /**
     * Date when primary IP can be modified again (format: yyyy-MM-dd)
     */
    modifyDateSecondary?: string;
    /**
     * Primary IP address associated with the user
     */
    primaryIP?: string;
    /**
     * Secondary IP address associated with the user
     */
    secondaryIP?: string;
    /**
     * Detected client IP address
     */
    detectedIP?: string;
    /**
     * | **Enum**        | **Description**                              |
     * |-----------------|----------------------------------------------|
     * | PRIMARY_MATCH   | Matches primary IP                           |
     * | SECONDARY_MATCH | Matches secondary IP                         |
     * | MISMATCH        | No match found                              |
     * | NOT_CONFIGURED  | No IP configured                            |
     */
    ipMatchStatus?: GetIPDetailsResponse.ipMatchStatus;
    /**
     * Flag indicating whether order placement is allowed based on IP match
     */
    ordersAllowed?: boolean;
};
export namespace GetIPDetailsResponse {
    /**
     * | **Enum**        | **Description**                              |
     * |-----------------|----------------------------------------------|
     * | PRIMARY_MATCH   | Matches primary IP                           |
     * | SECONDARY_MATCH | Matches secondary IP                         |
     * | MISMATCH        | No match found                              |
     * | NOT_CONFIGURED  | No IP configured                            |
     */
    export enum ipMatchStatus {
        PRIMARY_MATCH = 'PRIMARY_MATCH',
        SECONDARY_MATCH = 'SECONDARY_MATCH',
        MISMATCH = 'MISMATCH',
        NOT_CONFIGURED = 'NOT_CONFIGURED',
    }
}

