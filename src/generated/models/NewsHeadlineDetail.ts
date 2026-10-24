/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NewsObject } from './NewsObject';
/**
 * List of latest news items matching the request filters. Empty when the vendor has no items for this bucket (e.g. narrow date/time filters where matches only fall under nextNews).
 */
export type NewsHeadlineDetail = {
    newsObject?: NewsObject;
    /**
     * Top-level news category.
     */
    category?: string;
    /**
     * News sub-category.
     */
    subCategory?: string;
    /**
     * Article publish date, in YYYY-MM-DD format.
     */
    publishDate?: string;
    /**
     * Full company name.
     */
    stockName?: string;
    /**
     * ISIN of the security.
     */
    isinCode?: string;
    /**
     * Short market symbol.
     */
    smSymbol?: string;
    /**
     * NSE scrip code.
     */
    nseScripCode?: number;
    /**
     * BSE scrip code.
     */
    bseScripCode?: number;
    /**
     * Human-readable display name.
     */
    displaySymbol?: string;
    /**
     * Minimum price movement.
     */
    tickSize?: number;
    /**
     * Units per market lot.
     */
    lotSize?: number;
};

