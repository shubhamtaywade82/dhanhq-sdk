/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NewsHeadlineDetail } from './NewsHeadlineDetail';
/**
 * Container object. latestNews/nextNews hold the returned news items, filtered by category/stock and paginated per the request.
 */
export type NewsData = {
    /**
     * List of latest news items matching the request filters. Empty when the vendor has no items for this bucket (e.g. narrow date/time filters where matches only fall under nextNews).
     */
    latestNews?: Array<NewsHeadlineDetail>;
};

