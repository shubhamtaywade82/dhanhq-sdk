/**
 * Which Dhan host each request goes to.
 *
 * - `live`    — every request hits `https://api.dhan.co/v2` (default).
 * - `sandbox` — every request hits `https://sandbox.dhan.co/v2`.
 * - `hybrid`  — market data (quotes, option chain, charts, instruments, ScanX)
 *   and Global Stocks hit production for real prices, while trading and
 *   account requests (orders, positions, funds, statements, ...) hit the
 *   sandbox, so a strategy rehearses execution against live data without
 *   risking money.
 */
export type DhanMode = "live" | "sandbox" | "hybrid";

/** The two hosts a request can resolve to. */
export type DhanEnvironment = "live" | "sandbox";

export const DHAN_MODES: readonly DhanMode[] = ["live", "sandbox", "hybrid"];

export const LIVE_BASE_URL = "https://api.dhan.co/v2";
export const SANDBOX_BASE_URL = "https://sandbox.dhan.co/v2";

/**
 * What a request path is, for routing.
 *
 * - `public`       — needs no credentials and is identical on both hosts
 *   (the instrument CSV redirect); always production.
 * - `market_data`  — real-time or historical prices.
 * - `global_stocks`— the US-equities book; the sandbox does not mirror it.
 * - `trading`      — orders, portfolio, funds, statements and controls.
 */
export type RouteClass = "public" | "market_data" | "global_stocks" | "trading";

const MARKET_DATA_PREFIXES = [
  "/marketfeed/",
  "/optionchain",
  "/charts/",
  "/data/",
];

/** Strips query strings and a leading `/v2`, so callers can pass either form. */
export function normalizePath(url: string): string {
  const path = url.split("?")[0] ?? "";
  return path.startsWith("/v2/") ? path.slice(3) : path;
}

export function routeClassFor(url: string): RouteClass {
  const path = normalizePath(url);
  if (path.startsWith("/instrument/")) return "public";
  if (path.startsWith("/globalstocks")) return "global_stocks";
  if (MARKET_DATA_PREFIXES.some((prefix) => path.startsWith(prefix)))
    return "market_data";
  return "trading";
}

/** Resolves the host a request goes to under `mode`. */
export function environmentFor(mode: DhanMode, url: string): DhanEnvironment {
  const routeClass = routeClassFor(url);
  if (routeClass === "public") return "live";

  switch (mode) {
    case "sandbox":
      return "sandbox";
    case "hybrid":
      return routeClass === "trading" ? "sandbox" : "live";
    default:
      return "live";
  }
}

type Verb = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Operations the sandbox serves, from its own OpenAPI document
 * (`https://sandbox.dhan.co/v2/v3/api-docs`) plus `GET /profile`, whose route
 * exists on the sandbox but is undocumented. Everything else — super orders,
 * conditional/multi orders, P&L exit, multi-scrip margin, IP setup, ScanX,
 * market quotes, option chain, rolling options, Global Stocks — answers 404
 * there. The list is an allow-list so an unknown path fails closed.
 */
const SANDBOX_OPERATIONS: ReadonlyArray<readonly [Verb, RegExp]> = [
  ["GET", /^\/orders$/],
  ["POST", /^\/orders$/],
  ["POST", /^\/orders\/slicing$/],
  ["GET", /^\/orders\/external\/[^/]+$/],
  ["GET", /^\/orders\/[^/]+$/],
  ["PUT", /^\/orders\/[^/]+$/],
  ["DELETE", /^\/orders\/[^/]+$/],
  ["GET", /^\/trades$/],
  ["GET", /^\/trades\/[^/]+$/],
  ["GET", /^\/trades\/[^/]+\/[^/]+\/[^/]+$/],
  ["GET", /^\/holdings$/],
  ["GET", /^\/positions$/],
  ["POST", /^\/positions\/convert$/],
  ["POST", /^\/killswitch$/],
  ["GET", /^\/edis\/tpin$/],
  ["POST", /^\/edis\/form$/],
  ["POST", /^\/edis\/bulkform$/],
  ["GET", /^\/edis\/inquire\/[^/]+$/],
  ["GET", /^\/fundlimit$/],
  ["POST", /^\/margincalculator$/],
  ["GET", /^\/ledger$/],
  ["POST", /^\/charts\/historical$/],
  ["POST", /^\/charts\/intraday$/],
  ["GET", /^\/forever\/orders$/],
  ["POST", /^\/forever\/orders$/],
  ["PUT", /^\/forever\/orders\/[^/]+$/],
  ["DELETE", /^\/forever\/orders\/[^/]+$/],
  ["GET", /^\/profile$/],
];

/** True when the sandbox host serves this method + path. */
export function sandboxSupports(method: string, url: string): boolean {
  const verb = method.toUpperCase();
  const path = normalizePath(url);
  return SANDBOX_OPERATIONS.some(
    ([opVerb, pattern]) => opVerb === verb && pattern.test(path),
  );
}

/** Parses a mode from config or `DHAN_MODE`; throws on an unknown value. */
export function parseMode(value: string | undefined): DhanMode {
  if (value === undefined || value.trim() === "") return "live";
  const mode = value.trim().toLowerCase();
  if (!(DHAN_MODES as readonly string[]).includes(mode)) {
    throw new Error(
      `Unknown DHAN_MODE "${value}": expected one of ${DHAN_MODES.join(", ")}`,
    );
  }
  return mode as DhanMode;
}
