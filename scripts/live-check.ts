/**
 * End-to-end check against the real Dhan hosts: read endpoints, the market
 * feed WebSocket, and (opt-in) one tiny order placed and cancelled.
 *
 *   npm run live-check                      # read-only REST checks
 *   npm run live-check -- --ws              # + market feed WebSocket
 *   npm run live-check -- --place-test-order
 *
 * Environment (see README "Live testing"):
 *   DHAN_CLIENT_ID                                       production client id
 *   DHAN_PIN + DHAN_TOTP_SECRET                          PIN/TOTP login, token cached in
 *                                                        ~/.dhanhq (DHAN_TOKEN_CACHE_DIR)
 *   or DHAN_ACCESS_TOKEN (or DHAN_TOKEN)                 a static token
 *   DHAN_MODE=live|sandbox|hybrid                         default live
 *   DHAN_SANDBOX_CLIENT_ID, DHAN_SANDBOX_ACCESS_TOKEN     required for hybrid
 *   TEST_EXCHANGE_SEGMENT (NSE_EQ), TEST_SECURITY_ID (1333 = HDFCBANK)
 *   TEST_ORDER_OFFSET_PCT (5)   how far below LTP the test BUY is priced, 2-15
 *   TEST_ORDER_PRICE            explicit limit price (needed in full sandbox mode)
 *   LIVE_TRADING=true           required for --place-test-order on the production host
 *
 * The test order is deliberately unfillable: a 1-share LIMIT BUY priced below
 * the market, cancelled straight away. If it fills anyway the script says so
 * loudly — you then hold one share to sell yourself.
 */
import dotenv from "dotenv";

import { DhanClient } from "../src";
import { SandboxUnsupportedError } from "../src/errors";
import type { MarketFeedEvent } from "../src/types/ws.types";
import { environmentFor } from "../src/client/Environment";

dotenv.config({ path: ".env" });

type Status = "ok" | "error" | "n/a";
const results: Array<{ name: string; status: Status; detail: string }> = [];

const args = new Set(process.argv.slice(2));
const segment = process.env.TEST_EXCHANGE_SEGMENT ?? "NSE_EQ";
const securityId = process.env.TEST_SECURITY_ID ?? "1333";

function build(): DhanClient {
  const env = { ...process.env, DHAN_ACCESS_TOKEN: process.env.DHAN_ACCESS_TOKEN ?? process.env.DHAN_TOKEN };
  return DhanClient.fromEnv(env);
}

function describeAuth(client: DhanClient): string {
  if (!client.getTokenManager()) return "static access token (DHAN_ACCESS_TOKEN)";
  const cacheOff = ["off", "false", "0"].includes((process.env.DHAN_TOKEN_CACHE ?? "").trim().toLowerCase());
  return cacheOff ? "PIN/TOTP login, no token cache" : "PIN/TOTP login, cached token reused while valid";
}

async function check<T>(name: string, run: () => Promise<T>, describe: (value: T) => string = () => ""): Promise<T | undefined> {
  try {
    const value = await run();
    results.push({ name, status: "ok", detail: describe(value) });
    return value;
  } catch (error) {
    if (error instanceof SandboxUnsupportedError) {
      results.push({ name, status: "n/a", detail: "not served by the Dhan sandbox" });
      return undefined;
    }
    const message = error instanceof Error ? error.message : String(error);
    const details = (error as { details?: unknown }).details;
    results.push({ name, status: "error", detail: details ? `${message} ${JSON.stringify(details)}` : message });
    return undefined;
  }
}

function count(value: unknown): string {
  return Array.isArray(value) ? `${value.length} rows` : "";
}

async function readChecks(client: DhanClient): Promise<number | undefined> {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  await check("GET /profile", () => client.profile.get());
  await check("GET /fundlimit", () => client.funds.getLimit(), (f) => `available ${(f as { availabelBalance?: number }).availabelBalance ?? "?"}`);
  await check("GET /positions", () => client.positions.list(), count);
  await check("GET /holdings", () => client.positions.listHoldings(), count);
  await check("GET /orders", () => client.orders.list(), count);
  await check("GET /trades", () => client.orders.listTrades(), count);
  await check("GET /ledger", () => client.statements.ledger({ fromDate: weekAgo, toDate: today }));

  const ltpResponse = await check("POST /marketfeed/ltp", () =>
    client.marketFeed.ltp({ [segment]: [securityId] } as never),
  );
  const ltp = Number(
    (ltpResponse as { data?: Record<string, Record<string, { last_price?: number }>> } | undefined)?.data?.[segment]?.[securityId]
      ?.last_price ?? NaN,
  );
  if (Number.isFinite(ltp)) results[results.length - 1].detail = `LTP ${ltp}`;

  await check("POST /optionchain/expirylist", () =>
    client.optionChain.expiryList({ underlyingScrip: 13, underlyingSeg: "IDX_I" } as never),
  );
  await check("POST /charts/intraday", () =>
    client.charts.intraday({ exchangeSegment: segment, securityId, instrument: "EQUITY", interval: "5", fromDate: weekAgo, toDate: today } as never),
  );
  await check("GET /instrument/NSE_EQ", () => client.instruments.findBySecurityId("NSE_EQ", "1333"), (i) => (i as { symbolName?: string } | undefined)?.symbolName ?? "");

  return Number.isFinite(ltp) ? ltp : undefined;
}

async function wsCheck(client: DhanClient): Promise<void> {
  const feed = client.ws.market;
  await check(
    "WS market feed (ticker)",
    async () => {
      try {
        return await new Promise<MarketFeedEvent>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("no tick within 15s (market closed?)")), 15_000);
          feed.on("tick", (event: MarketFeedEvent) => {
            if ("ltp" in event && event.securityId === securityId) {
              clearTimeout(timer);
              resolve(event);
            }
          });
          feed.subscribe([{ exchangeSegment: segment, securityId }]);
          feed.connect().catch((error: unknown) => {
            clearTimeout(timer);
            reject(error);
          });
        });
      } finally {
        feed.disconnect();
      }
    },
    (tick) => ("ltp" in tick ? `LTP ${tick.ltp}` : tick.type),
  );
}

function roundDownToTick(price: number, tick = 0.05): number {
  return Math.floor(price / tick) * tick;
}

async function orderRoundTrip(client: DhanClient, ltp: number | undefined): Promise<void> {
  const host = client.getConfig().mode === "live" || !client.getConfig().mode ? "live" : "sandbox";
  if (host === "live" && process.env.LIVE_TRADING !== "true") {
    results.push({ name: "order round-trip", status: "error", detail: "production host: set LIVE_TRADING=true to place the test order" });
    return;
  }

  const offset = Math.min(15, Math.max(2, Number(process.env.TEST_ORDER_OFFSET_PCT ?? 5)));
  const explicit = Number(process.env.TEST_ORDER_PRICE ?? NaN);
  const price = Number.isFinite(explicit) ? explicit : ltp !== undefined ? roundDownToTick(ltp * (1 - offset / 100)) : NaN;
  if (!Number.isFinite(price) || price <= 0) {
    results.push({ name: "order round-trip", status: "error", detail: "no price: LTP unavailable — set TEST_ORDER_PRICE" });
    return;
  }

  const correlationId = `livecheck-${Date.now().toString(36)}`;
  console.log(`\nPlacing test order on ${host}: BUY 1 ${segment}:${securityId} LIMIT ${price.toFixed(2)} (LTP ${ltp ?? "?"}, ${offset}% below), correlationId ${correlationId}`);

  let orderId: string | undefined;
  try {
    const placed = await client.orders.place({
      transactionType: "BUY",
      exchangeSegment: segment as never,
      productType: "CNC",
      orderType: "LIMIT",
      validity: "DAY",
      securityId,
      quantity: 1,
      price: Number(price.toFixed(2)),
      correlationId,
    });
    orderId = placed.data.orderId;
    results.push({ name: "POST /orders (test order)", status: "ok", detail: `orderId ${orderId} status ${placed.data.orderStatus}` });
  } catch (error) {
    // A timeout may still have reached the exchange: reconcile by correlation id.
    results.push({ name: "POST /orders (test order)", status: "error", detail: error instanceof Error ? error.message : String(error) });
    const found = await check("GET /orders/external (reconcile)", () => client.orders.getByCorrelationId(correlationId));
    orderId = (found as { orderId?: string } | undefined)?.orderId ?? (Array.isArray(found) ? (found[0] as { orderId?: string })?.orderId : undefined);
    if (!orderId) return;
  }

  const status = await check("GET /orders/{id}", () => client.orders.getById(orderId!), (o) => String((o as { orderStatus?: string }).orderStatus));
  const current = String((status as { orderStatus?: string } | undefined)?.orderStatus ?? "");
  if (["TRADED", "PART_TRADED"].includes(current)) {
    results.push({ name: "TEST ORDER FILLED", status: "error", detail: `order ${orderId} is ${current} — you hold the bought share(s); sell them yourself` });
  }
  if (["PENDING", "TRANSIT", "PART_TRADED", ""].includes(current)) {
    await check("DELETE /orders/{id} (cancel)", () => client.orders.cancel(orderId!), (o) => String((o as { orderStatus?: string }).orderStatus));
    await check("GET /orders/{id} (after cancel)", () => client.orders.getById(orderId!), (o) => String((o as { orderStatus?: string }).orderStatus));
  }
}

async function main(): Promise<void> {
  const client = build();
  const config = client.getConfig();
  console.log(`Mode: ${config.mode ?? "live"}`);
  console.log(`Auth: ${describeAuth(client)}`);
  console.log(`Routing: orders -> ${new URL(clientUrl(config, "/orders")).host}, market data -> ${new URL(clientUrl(config, "/marketfeed/ltp")).host}`);

  const ltp = await readChecks(client);
  const managed = client.getTokenManager()?.getToken();
  if (managed?.expiresAt) console.log(`Token valid until ${new Date(managed.expiresAt).toISOString()}`);
  if (args.has("--ws")) await wsCheck(client);
  if (args.has("--place-test-order")) await orderRoundTrip(client, ltp);

  const tag: Record<Status, string> = { ok: "[OK] ", error: "[ERR]", "n/a": "[N/A]" };
  console.log("");
  for (const result of results) console.log(`${tag[result.status]} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
  const errors = results.filter((r) => r.status === "error").length;
  console.log(`\n${results.length} checks: ${results.length - errors} ok/n-a, ${errors} error(s)`);
  process.exitCode = errors > 0 ? 1 : 0;
}

function clientUrl(config: ReturnType<DhanClient["getConfig"]>, path: string): string {
  return environmentFor(config.mode ?? "live", path) === "sandbox"
    ? config.sandboxBaseURL ?? "https://sandbox.dhan.co/v2"
    : config.baseURL ?? "https://api.dhan.co/v2";
}

void main();
