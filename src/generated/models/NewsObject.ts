/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Article headline, sentiment, and full text.
 */
export type NewsObject = {
    /**
     * Sentiment of the article.
     */
    overallSentiment?: NewsObject.overallSentiment;
    /**
     * Article headline.
     */
    title?: string;
    /**
     * Full article body/summary.
     */
    text?: string;
};
export namespace NewsObject {
    /**
     * Sentiment of the article.
     */
    export enum overallSentiment {
        POSITIVE = 'positive',
        NEGATIVE = 'negative',
        NEUTRAL = 'neutral',
    }
}

