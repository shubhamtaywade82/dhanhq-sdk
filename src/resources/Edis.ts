import type {
  EdisBulkFormRequest,
  EdisFormRequest,
  EdisFormResponse,
  EdisQtyStatusResponse,
} from "../generated";

import { HttpClient } from "../client/HttpClient";

/**
 * Plain string-literal request shapes for {@link Edis} — the generated
 * `EdisFormRequest`/`EdisBulkFormRequest` types use TS enums for `exchange`
 * and `segment`, so `exchange: "NSE"` doesn't type-check against them
 * directly. Deriving the literal unions from the enums via `${Enum}` keeps
 * them in sync with `npm run generate` without hand-transcribing.
 */
export interface EdisFormInput {
  isin: string;
  qty: number;
  exchange: `${EdisFormRequest.exchange}`;
  segment: `${EdisFormRequest.segment}`;
  bulk: boolean;
}

export interface EdisBulkFormInput {
  isin: string[];
  exchange: `${EdisBulkFormRequest.exchange}`;
  segment: `${EdisBulkFormRequest.segment}`;
}

export class Edis {
  constructor(private readonly httpClient: HttpClient) {}

  public async form(request: EdisFormInput): Promise<EdisFormResponse> {
    return this.httpClient.request<EdisFormResponse, EdisFormInput>({
      method: "POST",
      url: "/edis/form",
      data: request,
      safeToRetry: false,
    });
  }

  public async bulkForm(request: EdisBulkFormInput): Promise<EdisFormResponse> {
    return this.httpClient.request<EdisFormResponse, EdisBulkFormInput>({
      method: "POST",
      url: "/edis/bulkform",
      data: request,
      safeToRetry: false,
    });
  }

  public async requestTpin(): Promise<unknown> {
    return this.httpClient.request<unknown>({
      method: "GET",
      url: "/edis/tpin",
      safeToRetry: true,
    });
  }

  public async getQuantityStatus(isin: string): Promise<EdisQtyStatusResponse> {
    return this.httpClient.request<EdisQtyStatusResponse>({
      method: "GET",
      url: `/edis/inquire/${encodeURIComponent(isin)}`,
      safeToRetry: true,
    });
  }
}
