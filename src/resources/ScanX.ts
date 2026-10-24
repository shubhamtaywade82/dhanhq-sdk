import { HttpClient } from "../client/HttpClient";

/** `POST /data/companyinfo` — company overview, ratios, shareholding. */
export interface CompanyInfoRequest {
  securityId: string;
  exchangeSegment: "NSE_EQ" | "BSE_EQ";
  instrument: "EQUITY";
  metrics: Array<"CO" | "RATIOS" | "SHP">;
}

/** `POST /data/marketmovers` — instruments ranked by OI, volume or price change. */
export interface MarketMoversRequest {
  exchangeSegment:
    "NSE_FNO" | "BSE_FNO" | "NSE_COMM" | "MCX_COMM" | "NSE_EQ" | "BSE_EQ";
  instrument: Array<
    "OPTIDX" | "OPTSTK" | "OPTFUT" | "FUTIDX" | "FUTSTK" | "FUTCOM" | "EQUITY"
  >;
  category:
    | "HIGHEST_OI"
    | "OI_GAINERS"
    | "OI_LOSERS"
    | "TOP_VOLUME"
    | "PRICE_GAINERS"
    | "PRICE_LOSERS";
  /** YYYY-MM-DD; required for option/future instruments. */
  expiry?: string;
  /** Stock universe; applies to EQUITY only (e.g. "NIFTY_50", "FNO_STOCKS"). */
  universe?: string;
  /** 1-100. */
  limit?: number;
}

/** `POST /data/newsheadline` — latest headlines, newest first. */
export interface NewsHeadlineRequest {
  dhanClientId?: string;
  /** e.g. ["ALL"], ["COMPANIES", "IPO"]. */
  categories: string[];
  /** 1-50. */
  limit: number;
  universe?: "PORTFOLIO" | "WATCHLIST";
  stockList?: string[];
}

/** `POST /data/technical` — server-computed indicators. */
export interface TechnicalDataRequest {
  securityId: string;
  exchangeSegment: "NSE_EQ" | "IDX_I";
  instrument: "INDEX" | "EQUITY";
  timeframe: "1" | "5" | "15" | "D";
  /** e.g. ["SMA_20", "RSI_14", "MACD_HIST"]. */
  indicators: string[];
}

/**
 * ScanX market-analytics data APIs (`/v2/data/*`). Read-only POSTs on the data
 * tier; production only — the sandbox does not serve them, so in `hybrid`
 * mode they route to production with the production token.
 */
export class ScanX {
  constructor(private readonly httpClient: HttpClient) {}

  public async companyInfo<T = unknown>(
    request: CompanyInfoRequest,
  ): Promise<T> {
    return this.post<T>("/data/companyinfo", request);
  }

  public async marketMovers<T = unknown>(
    request: MarketMoversRequest,
  ): Promise<T> {
    if (
      request.limit !== undefined &&
      (request.limit < 1 || request.limit > 100)
    ) {
      throw new RangeError("marketMovers limit must be between 1 and 100");
    }
    return this.post<T>("/data/marketmovers", request);
  }

  public async newsHeadline<T = unknown>(
    request: NewsHeadlineRequest,
  ): Promise<T> {
    if (request.limit < 1 || request.limit > 50) {
      throw new RangeError("newsHeadline limit must be between 1 and 50");
    }
    return this.post<T>("/data/newsheadline", {
      ...request,
      dhanClientId: request.dhanClientId ?? this.httpClient.getClientId(),
    });
  }

  public async technical<T = unknown>(
    request: TechnicalDataRequest,
  ): Promise<T> {
    return this.post<T>("/data/technical", request);
  }

  private post<T>(url: string, data: unknown): Promise<T> {
    return this.httpClient.request<T>({
      method: "POST",
      url,
      data,
      safeToRetry: true,
      tier: "data_api",
    });
  }
}
