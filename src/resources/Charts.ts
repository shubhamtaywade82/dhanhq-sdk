import type {
  ChartsResponse,
  HistoricalChartsRequest,
  IntradayChartsRequest,
  OptionChartRequest,
  OptionChartResponse,
} from "../generated";

import { HttpClient } from "../client/HttpClient";
import { historicalChartsSchema, intradayChartsSchema } from "../contracts/charts.schema";
import { ValidationError } from "../errors";
import { adjustTradingDateRange } from "../ta/marketCalendar";

/**
 * Plain string-literal request shapes for {@link Charts} — the generated
 * `IntradayChartsRequest`/`HistoricalChartsRequest`/`OptionChartRequest` types
 * use TS enums for `exchangeSegment`/`instrument`/`interval` (and, for option
 * charts, `expiryFlag`/`drvOptionType`/`requiredData`), so
 * `exchangeSegment: "NSE_EQ"` doesn't type-check against them directly.
 * Deriving the literal unions from the enums via `${Enum}` keeps them in sync
 * with `npm run generate`.
 */
export interface IntradayChartsInput {
  securityId?: string;
  exchangeSegment?: `${IntradayChartsRequest.exchangeSegment}`;
  instrument?: `${IntradayChartsRequest.instrument}`;
  interval?: `${IntradayChartsRequest.interval}`;
  oi?: boolean;
  fromDate?: string;
  toDate?: string;
}

export interface HistoricalChartsInput {
  securityId?: string;
  exchangeSegment?: `${HistoricalChartsRequest.exchangeSegment}`;
  instrument?: `${HistoricalChartsRequest.instrument}`;
  expiryCode?: number;
  oi?: boolean;
  fromDate?: string;
  toDate?: string;
}

export interface OptionChartInput {
  exchangeSegment?: `${OptionChartRequest.exchangeSegment}`;
  interval?: `${OptionChartRequest.interval}`;
  securityId?: number;
  instrument?: `${OptionChartRequest.instrument}`;
  expiryFlag?: `${OptionChartRequest.expiryFlag}`;
  expiryCode?: number;
  strike?: string;
  drvOptionType?: `${OptionChartRequest.drvOptionType}`;
  requiredData?: `${OptionChartRequest.requiredData}`;
  fromDate?: string;
  toDate?: string;
}

export interface ExtendedIntradayChartsRequest extends IntradayChartsInput {
  autoAdjustDates?: boolean;
}

export interface ExtendedHistoricalChartsRequest extends HistoricalChartsInput {
  autoAdjustDates?: boolean;
}

export class Charts {
  constructor(private readonly httpClient: HttpClient) {}

  public async option(
    request: OptionChartInput,
  ): Promise<OptionChartResponse> {
    return this.httpClient.request<OptionChartResponse, OptionChartInput>({
      method: "POST",
      url: "/charts/rollingoption",
      data: request,
      safeToRetry: true,
    });
  }

  public async intraday(
    request: ExtendedIntradayChartsRequest,
  ): Promise<ChartsResponse> {
    const payload = { ...request };
    delete payload.autoAdjustDates;

    // Auto-adjust enabled by default unless explicitly disabled with autoAdjustDates: false
    if (request.autoAdjustDates !== false) {
      const adjusted = adjustTradingDateRange(
        { fromDate: request.fromDate, toDate: request.toDate },
        { maxDays: 90, clampFuture: true, adjustNonTradingDays: true },
      );
      payload.fromDate = adjusted.fromDate;
      payload.toDate = adjusted.toDate;
    }

    const validated = intradayChartsSchema.safeParse(payload);
    if (!validated.success) {
      throw new ValidationError(validated.error);
    }

    return this.httpClient.request<ChartsResponse, IntradayChartsInput>({
      method: "POST",
      url: "/charts/intraday",
      data: payload,
      safeToRetry: true,
    });
  }

  public async historical(
    request: ExtendedHistoricalChartsRequest,
  ): Promise<ChartsResponse> {
    const payload = { ...request };
    delete payload.autoAdjustDates;

    // Auto-adjust enabled by default unless explicitly disabled with autoAdjustDates: false
    if (request.autoAdjustDates !== false) {
      const adjusted = adjustTradingDateRange(
        { fromDate: request.fromDate, toDate: request.toDate },
        { maxDays: 3650, clampFuture: true, adjustNonTradingDays: true },
      );
      payload.fromDate = adjusted.fromDate;
      payload.toDate = adjusted.toDate;
    }

    const validated = historicalChartsSchema.safeParse(payload);
    if (!validated.success) {
      throw new ValidationError(validated.error);
    }

    return this.httpClient.request<ChartsResponse, HistoricalChartsInput>({
      method: "POST",
      url: "/charts/historical",
      data: payload,
      safeToRetry: true,
    });
  }
}
