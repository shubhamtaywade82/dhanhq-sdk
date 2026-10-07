import { HttpClient } from "../client/HttpClient";
import {
  optionChainExpiryListSchema,
  optionChainRequestSchema,
} from "../contracts/option-chain.schema";
import { ValidationError } from "../errors";

export interface OptionChainRequest {
  underlyingScrip: number;
  underlyingSeg: string;
  expiry: string;
}

export interface ExpiryListRequest {
  underlyingScrip: number;
  underlyingSeg: string;
}

export interface OptionGreeks {
  delta?: number;
  theta?: number;
  gamma?: number;
  vega?: number;
}

/** One side (call or put) of a strike, as returned under `oc.<strike>.ce|pe`. */
export interface OptionLeg {
  greeks?: OptionGreeks;
  implied_volatility?: number;
  last_price?: number;
  oi?: number;
  previous_oi?: number;
  volume?: number;
  previous_close_price?: number;
  previous_volume?: number;
  top_ask_price?: number;
  top_ask_quantity?: number;
  top_bid_price?: number;
  top_bid_quantity?: number;
  /** Tradable security ID of this leg (added to the response in API v2.5). */
  security_id?: string | number;
  /** Average traded price of this leg for the session (added in API v2.5). */
  average_price?: number;
  /** Fields Dhan adds later pass through `normalizeOptionChain` untouched. */
  [key: string]: unknown;
}

export interface RawOptionChainResponse {
  status?: string;
  data?: {
    last_price?: number;
    oc?: Record<string, { ce?: OptionLeg; pe?: OptionLeg }>;
  };
  [key: string]: unknown;
}

export interface ExpiryListResponse {
  status?: string;
  data?: string[];
  [key: string]: unknown;
}

/** A single strike with both legs, normalized out of the keyed `oc` map. */
export interface StrikeEntry {
  strike: number;
  call?: OptionLeg;
  put?: OptionLeg;
}

/** Flattened list of strikes returned by `fetchNormalized()`. */
export interface NormalizedOptionChain {
  lastPrice?: number;
  strikes: StrikeEntry[];
}

/**
 * Option chain data (`/v2/optionchain`).
 *
 * Note this endpoint is rate limited to one call every three seconds, well
 * below the other data APIs.
 */
export class OptionChain {
  constructor(private readonly httpClient: HttpClient) {}

  /** Raw option chain payload, exactly as the API returns it. */
  public async fetch(
    request: OptionChainRequest,
  ): Promise<RawOptionChainResponse> {
    const validated = optionChainRequestSchema.safeParse(request);
    if (!validated.success) {
      throw new ValidationError(validated.error);
    }

    return this.httpClient.request<RawOptionChainResponse, OptionChainRequest>({
      method: "POST",
      url: "/optionchain",
      data: request,
      safeToRetry: true,
      tier: "option_chain",
    });
  }

  /** Available expiry dates for an underlying, ascending. */
  public async expiryList(
    request: ExpiryListRequest,
  ): Promise<ExpiryListResponse> {
    const validated = optionChainExpiryListSchema.safeParse(request);
    if (!validated.success) {
      throw new ValidationError(validated.error);
    }

    return this.httpClient.request<ExpiryListResponse, ExpiryListRequest>({
      method: "POST",
      url: "/optionchain/expirylist",
      data: request,
      safeToRetry: true,
      tier: "option_chain",
    });
  }

  /** Option chain with the strike map flattened and sorted ascending. */
  public async fetchNormalized(
    request: OptionChainRequest,
  ): Promise<NormalizedOptionChain> {
    return normalizeOptionChain(await this.fetch(request));
  }
}

/**
 * Flattens the `oc` map (keyed by a stringified float strike) into a sorted
 * array. Strikes that do not parse as numbers are dropped rather than sorted
 * to the front as `NaN`. Each leg object is passed through by reference, so
 * every field the API returns (including ones not yet typed here) survives.
 */
export function normalizeOptionChain(
  response: RawOptionChainResponse,
): NormalizedOptionChain {
  const oc = response.data?.oc ?? {};
  const strikes: StrikeEntry[] = Object.entries(oc)
    .map(([strike, legs]) => ({
      strike: Number(strike),
      call: legs?.ce,
      put: legs?.pe,
    }))
    .filter((entry) => Number.isFinite(entry.strike))
    .sort((a, b) => a.strike - b.strike);

  return { lastPrice: response.data?.last_price, strikes };
}

/** Strike closest to `target`, or `undefined` when the chain is empty. */
export function nearestStrike(
  chain: NormalizedOptionChain,
  target: number,
): StrikeEntry | undefined {
  if (chain.strikes.length === 0) {
    return undefined;
  }

  return chain.strikes.reduce((best, entry) =>
    Math.abs(entry.strike - target) < Math.abs(best.strike - target)
      ? entry
      : best,
  );
}

/** Exact strike match within `tolerance`; `undefined` when no strike sits there. */
export function findStrike(
  chain: NormalizedOptionChain,
  target: number,
  tolerance = 0.001,
): StrikeEntry | undefined {
  return chain.strikes.find(
    (entry) => Math.abs(entry.strike - target) < tolerance,
  );
}
