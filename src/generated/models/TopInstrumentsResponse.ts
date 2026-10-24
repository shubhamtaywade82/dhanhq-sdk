/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TopInstrumentDetail } from './TopInstrumentDetail';
export type TopInstrumentsResponse = {
    /**
     * Exchange segment for which the instruments were fetched.
     */
    exchangeSegment?: string;
    /**
     * Ranking category applied to the result.
     */
    category?: string;
    /**
     * List of instruments ranked according to the selected category.
     */
    data?: Array<TopInstrumentDetail>;
};

