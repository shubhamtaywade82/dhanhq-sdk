import { HttpClient } from "../client/HttpClient";
import { expiredOptionsDataSchema } from "../contracts/expired-options.schema";
import { ValidationError } from "../errors";
import { adjustTradingDateRange } from "../ta/marketCalendar";

export type ExpiredOptionsExpiryFlag = "WEEK" | "MONTH" | "WEEKLY" | "MONTHLY";
export type ExpiredOptionsField =
  | "open" | "high" | "low" | "close" | "iv"
  | "volume" | "strike" | "oi" | "spot";

export interface ExpiredOptionsDataRequest {
  securityId: string | number;
  exchangeSegment: "NSE_FNO" | "BSE_FNO" | "MCX_COMM" | "IDX_I" | "NSE_EQ";
  /** Dhan instrument enum. For NIFTY index options, use OPTIDX. */
  instrument?: "OPTIDX" | "OPTSTK";
  /** Deprecated compatibility alias. INDEX maps to OPTIDX; STOCK maps to OPTSTK. */
  instrumentType?: "INDEX" | "STOCK";
  /** WEEKLY/MONTHLY are SDK aliases normalized to Dhan's WEEK/MONTH enums. */
  expiryFlag: ExpiredOptionsExpiryFlag;
  expiryCode: number;
  strike: string;
  drvOptionType: "CALL" | "PUT";
  interval?: "1" | "5" | "15" | "25" | "60";
  requiredData?: ExpiredOptionsField[];
  fromDate: string; // YYYY-MM-DD; toDate is non-inclusive
  toDate: string;
  autoAdjustDates?: boolean;
}

/** One observation represented by an element in the parallel response arrays. */
export interface ExpiredOptionsDataPoint {
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  oi?: number;
  iv?: number;
  strike?: number;
  spot?: number;
}

/** Dhan returns one option side as parallel arrays aligned by index. */
export interface ExpiredOptionsDataSeries {
  timestamp?: number[];
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
  oi?: number[];
  iv?: number[];
  strike?: number[];
  spot?: number[];
}

export interface ExpiredOptionsDataResponse {
  status?: string;
  data?: {
    ce?: ExpiredOptionsDataSeries | null;
    pe?: ExpiredOptionsDataSeries | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Dhan rolling expired-options data. Each response contains nested CE/PE
 * parallel arrays. The request is limited to 30 calendar days and toDate is
 * non-inclusive. The securityId is the underlying (NIFTY = 13), not the option.
 *
 * @see https://dhanhq.co/docs/v2/expired-options-data/
 */
export class ExpiredOptionsData {
  constructor(private readonly httpClient: HttpClient) {}

  public async fetch(
    request: ExpiredOptionsDataRequest,
  ): Promise<ExpiredOptionsDataResponse> {
    if (request.fromDate > request.toDate) {
      throw new RangeError("fromDate must be <= toDate");
    }

    const spanDays =
      (Date.parse(request.toDate + "T00:00:00Z") -
        Date.parse(request.fromDate + "T00:00:00Z")) /
      (24 * 60 * 60 * 1000);

    if (!Number.isFinite(spanDays) || spanDays > 30) {
      throw new RangeError(
        "Expired options date range (" + spanDays +
        " days) exceeds Dhan's maximum of 30 calendar days",
      );
    }

    const expiryFlag =
      request.expiryFlag === "WEEKLY"
        ? "WEEK"
        : request.expiryFlag === "MONTHLY"
          ? "MONTH"
          : request.expiryFlag;

    const reqCopy = { ...request, expiryFlag };
    delete (reqCopy as { autoAdjustDates?: boolean }).autoAdjustDates;

    if (request.autoAdjustDates !== false) {
      const adjusted = adjustTradingDateRange(
        { fromDate: request.fromDate, toDate: request.toDate },
        { maxDays: 30, clampFuture: true, adjustNonTradingDays: true },
      );
      reqCopy.fromDate = adjusted.fromDate;
      reqCopy.toDate = adjusted.toDate;
    }

    const validated = expiredOptionsDataSchema.safeParse(reqCopy);
    if (!validated.success) {
      throw new ValidationError(validated.error);
    }

    const instrument =
      reqCopy.instrument ??
      (reqCopy.instrumentType === "INDEX" ? "OPTIDX" : "OPTSTK");
    const payload = {
      securityId: reqCopy.securityId,
      exchangeSegment: reqCopy.exchangeSegment,
      instrument,
      expiryFlag: reqCopy.expiryFlag,
      expiryCode: reqCopy.expiryCode,
      strike: reqCopy.strike,
      drvOptionType: reqCopy.drvOptionType,
      interval: reqCopy.interval,
      requiredData: reqCopy.requiredData,
      fromDate: reqCopy.fromDate,
      toDate: reqCopy.toDate,
    };

    return this.httpClient.request<ExpiredOptionsDataResponse, typeof payload>({
      method: "POST",
      url: "/charts/rollingoption",
      data: payload,
      safeToRetry: true,
    });
  }

  public static buildAtmRequest(options: {
    securityId: string;
    exchangeSegment: ExpiredOptionsDataRequest["exchangeSegment"];
    instrumentType: "INDEX" | "STOCK";
    expiryFlag: ExpiredOptionsExpiryFlag;
    expiryCode: number;
    optionType: "CALL" | "PUT";
    fromDate: string;
    toDate: string;
    requiredData?: ExpiredOptionsField[];
  }): ExpiredOptionsDataRequest {
    return {
      securityId: options.securityId,
      exchangeSegment: options.exchangeSegment,
      instrumentType: options.instrumentType,
      expiryFlag: options.expiryFlag,
      expiryCode: options.expiryCode,
      strike: "ATM",
      drvOptionType: options.optionType,
      requiredData:
        options.requiredData ?? ["close", "iv", "volume", "strike", "oi", "spot"],
      fromDate: options.fromDate,
      toDate: options.toDate,
    };
  }

  public static buildOffsetAtmRequest(options: {
    securityId: string;
    exchangeSegment: ExpiredOptionsDataRequest["exchangeSegment"];
    instrumentType: "INDEX" | "STOCK";
    expiryFlag: ExpiredOptionsExpiryFlag;
    expiryCode: number;
    optionType: "CALL" | "PUT";
    offset: number;
    fromDate: string;
    toDate: string;
    requiredData?: ExpiredOptionsField[];
  }): ExpiredOptionsDataRequest {
    if (!Number.isInteger(options.offset) || Math.abs(options.offset) > 10) {
      throw new RangeError("offset must be an integer between -10 and +10");
    }

    const strike =
      options.offset >= 0 ? "ATM+" + options.offset : "ATM" + options.offset;

    return {
      securityId: options.securityId,
      exchangeSegment: options.exchangeSegment,
      instrumentType: options.instrumentType,
      expiryFlag: options.expiryFlag,
      expiryCode: options.expiryCode,
      strike,
      drvOptionType: options.optionType,
      requiredData:
        options.requiredData ?? ["close", "iv", "volume", "strike", "oi", "spot"],
      fromDate: options.fromDate,
      toDate: options.toDate,
    };
  }
}
