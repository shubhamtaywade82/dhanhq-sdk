import type {
  HoldingResponse,
  PositionConversionRequest,
  PositionResponse,
  UserIPResponse,
} from "../generated";

import { HttpClient } from "../client/HttpClient";

/**
 * Plain string-literal request shape for {@link Positions.convert} — the
 * generated `PositionConversionRequest` type uses TS enums for
 * `fromProductType`/`exchangeSegment`/`positionType`/`toProductType`, so
 * `fromProductType: "INTRADAY"` doesn't type-check against it directly.
 * Deriving the literal unions from the enums via `${Enum}` keeps them in sync
 * with `npm run generate` without hand-transcribing every member.
 */
export interface ConvertPositionRequest {
  dhanClientId?: string;
  fromProductType?: `${PositionConversionRequest.fromProductType}`;
  exchangeSegment?: `${PositionConversionRequest.exchangeSegment}`;
  positionType?: `${PositionConversionRequest.positionType}`;
  securityId?: string;
  convertQty?: number;
  toProductType?: `${PositionConversionRequest.toProductType}`;
}

export class Positions {
  constructor(private readonly httpClient: HttpClient) {}

  public async list(): Promise<PositionResponse[]> {
    return this.httpClient.request<PositionResponse[]>({
      method: "GET",
      url: "/positions",
      safeToRetry: true,
    });
  }

  public async listHoldings(): Promise<HoldingResponse[]> {
    return this.httpClient.request<HoldingResponse[]>({
      method: "GET",
      url: "/holdings",
      safeToRetry: true,
    });
  }

  public async convert(request: ConvertPositionRequest): Promise<unknown> {
    return this.httpClient.request<unknown, ConvertPositionRequest>({
      method: "POST",
      url: "/positions/convert",
      data: request,
      safeToRetry: false,
    });
  }

  public async exitAll(): Promise<UserIPResponse> {
    return this.httpClient.request<UserIPResponse>({
      method: "DELETE",
      url: "/positions",
      safeToRetry: false,
    });
  }
}
