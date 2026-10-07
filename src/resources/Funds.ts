import type {
  FundLimitResponse,
  KnowYourMarginReq,
  KnowYourMarginResponse,
  MultiScripMarginCalcResponse,
} from "../generated";
import type { MarginScriptItem } from "./MarginCalculator";

import { HttpClient } from "../client/HttpClient";

/**
 * Plain string-literal request shapes for {@link Funds} — the generated
 * `KnowYourMarginReq`/`MultiScripMarginCalcRequest` types use TS enums for
 * `exchangeSegment`/`transactionType`/`productType`, so
 * `exchangeSegment: "NSE_FNO"` doesn't type-check against them directly.
 * Deriving the literal unions from the enums via `${Enum}` keeps them in sync
 * with `npm run generate`.
 */
export interface KnowYourMarginInput {
  dhanClientId?: string;
  exchangeSegment?: `${KnowYourMarginReq.exchangeSegment}`;
  transactionType?: `${KnowYourMarginReq.transactionType}`;
  quantity?: number;
  productType?: `${KnowYourMarginReq.productType}`;
  securityId?: string;
  price?: number;
  triggerPrice?: number;
}

export interface MultiScripMarginInput {
  includePosition?: boolean;
  includeOrder?: boolean;
  dhanClientId?: string;
  scripList?: MarginScriptItem[];
}

export class Funds {
  constructor(private readonly httpClient: HttpClient) {}

  public async getLimit(): Promise<FundLimitResponse> {
    return this.httpClient.request<FundLimitResponse>({
      method: "GET",
      url: "/fundlimit",
      safeToRetry: true,
    });
  }

  public async calculateMargin(
    request: KnowYourMarginInput,
  ): Promise<KnowYourMarginResponse> {
    return this.httpClient.request<KnowYourMarginResponse, KnowYourMarginInput>({
      method: "POST",
      url: "/margincalculator",
      data: request,
      safeToRetry: true,
    });
  }

  public async calculateMultiMargin(
    request: MultiScripMarginInput,
  ): Promise<MultiScripMarginCalcResponse> {
    return this.httpClient.request<
      MultiScripMarginCalcResponse,
      MultiScripMarginInput
    >({
      method: "POST",
      url: "/margincalculator/multi",
      data: request,
      safeToRetry: true,
    });
  }
}
