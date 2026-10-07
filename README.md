# DhanHQ TS — TypeScript & Node.js SDK for DhanHQ API v2

Production-grade TypeScript SDK and Node.js client for the [DhanHQ](https://dhanhq.co) trading API. Build algorithmic trading systems with typed REST APIs, real-time WebSocket market data, order updates, historical OHLC, option chains and Greeks, technical indicators, risk management, composable trading skills, and MCP tools for AI trading agents.

> **Community project.** This is an independent SDK and is not affiliated with, endorsed by, or supported by Dhan. Dhan publishes its own official clients as [`dhanhq`](https://www.npmjs.com/package/dhanhq) and [`dhanhq-ts`](https://www.npmjs.com/package/dhanhq-ts).

---

## Installation

```bash
npm install @nemesis-oss/dhanhq-sdk
```

Requires Node.js 18 or newer. Ships both ESM and CommonJS builds with
TypeScript declarations for each.

In a hurry? [`QUICKSTART.md`](QUICKSTART.md) covers the five things you'll
do first in about fifty lines.

---

## Why This SDK

- Typed API generated from OpenAPI — every endpoint, every parameter
- Real-time WebSocket market data with binary packet parsing (LTP, OHLCV, 5/20-level depth)
- Safe order execution with validation, `correlationId`, and no blind retries
- Built for Node.js trading systems, bots, and backend services
- Batteries included above the transport layer:
  - **Technical analysis** — SMA/EMA/WMA, RSI, MACD, Bollinger, ATR, ADX, Stochastic, Supertrend, VWAP, OBV, multi-timeframe bias
  - **Option analytics** — Black-Scholes pricing, Greeks, implied volatility, max pain, PCR, OI walls
  - **Risk pipeline** — pre-trade checks wired into every order path
  - **Composable trading skills** — eleven strategies that stop at a reviewable intent
  - **MCP server + agent tools** — the whole SDK exposed to LLM/AI clients behind a policy gate

---

## Quick Start

### 1. Initialize Client

```ts
import { DhanClient } from "@nemesis-oss/dhanhq-sdk";

// Option A: Direct static token
const client = new DhanClient({
  token: process.env.DHAN_TOKEN!,
  clientId: process.env.DHAN_CLIENT_ID!,
});

// Option B: Auto-fetch token from your auth service endpoint
const client = await DhanClient.fromTokenEndpoint({
  endpointBaseUrl: "https://algo-trading-api.onrender.com",
  bearerToken: process.env.DHAN_TOKEN_ACCESS_TOKEN!,
});
```

---

### 2. Place Order

```ts
await client.orders.place({
  dhanClientId: process.env.DHAN_CLIENT_ID!,
  transactionType: "BUY",
  exchangeSegment: "NSE_FNO",
  productType: "INTRADAY",
  orderType: "MARKET",
  validity: "DAY",
  securityId: "12345",
  quantity: 15,
  correlationId: "strategy-entry-001",
});
```

---

### 3. Start WebSocket Market Feed & Market Depth

```ts
// Enable 20-level market depth feed (optional)
client.ws.enableDepth("twenty");

await client.ws.connect();

// Subscribe market feed (LTP, OHLCV, 5-level depth)
client.ws.market.subscribe([
  { exchangeSegment: "NSE_FNO", securityId: "12345" },
]);

client.ws.market.on("tick", (tick) => {
  console.log(tick.ltp);
});

// Listen for 20-level or 200-level full market depth
client.ws.depth?.subscribe([
  { exchangeSegment: "NSE_EQ", securityId: "1333" }, // HDFC Bank
]);

client.ws.depth?.on("depth", (event) => {
  console.log(event.type, event.levels); // top 20 bid/ask levels
});
```

---

### 4. Listen for Real-time Order Updates

```ts
client.ws.orders.on("order", (order) => {
  console.log(order.Status, order.AvgTradedPrice);
});
```

---

### 5. Market Data, Instruments and Option Chains

```ts
// Resolve a symbol to a security id (scrip master, cached in memory)
const [reliance] = await client.instruments.search("RELIANCE");

// Snapshot prices for up to 1000 instruments at once
await client.marketFeed.ltp({ NSE_EQ: [reliance.securityId] });
await client.marketFeed.quote({ IDX_I: [13] });

// Option chain, flattened into a sorted list of strikes
const chain = await client.optionChain.fetchNormalized({
  underlyingScrip: 13,
  underlyingSeg: "IDX_I",
  expiry: "2026-02-26",
});

// Expired options data (historical backtesting for expired options)
const expiredData = await client.expiredOptionsData.fetch({
  securityId: 13, // Nifty 50 — the UNDERLYING, not the option contract
  exchangeSegment: "NSE_FNO",
  instrument: "OPTIDX",
  expiryFlag: "WEEK",
  expiryCode: 1,
  strike: "ATM",
  drvOptionType: "CALL",
  interval: "15",
  fromDate: "2026-07-01",
  toDate: "2026-07-28",
});
```

---

### 5b. Runtime Contracts & Automatic Date Normalization

All market data, charts, option chain, and expired options requests pass through runtime Zod contracts (`src/contracts/`) before firing HTTP requests.

- **Automatic Date Normalization (`autoAdjustDates: true` by default)**:
  - Dates landing on **weekends or holidays** (e.g. Saturday/Sunday) are automatically shifted **-1 to -2 days** to the nearest active trading session (Friday).
  - Dates in the **future (`toDate > today IST`)** or requested before session start (pre-market/Sunday) automatically adjust to the **latest completed trading day**.
  - Date ranges exceeding API limits (e.g. >90 days for intraday charts, >180 days for expired options) are automatically clamped.
  - To disable auto-adjustment and enforce strict error throwing, pass `{ autoAdjustDates: false }`.

```ts
import { adjustTradingDateRange, getMarketSessionInfo } from "@nemesis-oss/dhanhq-sdk";

// Check market session state in IST
const session = getMarketSessionInfo();
console.log(session.sessionState); // "IN_SESSION" | "PRE_MARKET" | "POST_MARKET" | "CLOSED"

// Manually normalize date ranges if needed
const normalized = adjustTradingDateRange({
  fromDate: "2026-07-01",
  toDate: "2026-07-26", // Sunday -> auto-shifts to 2026-07-24 (Friday)
});
```

---

### 6. Technical Analysis

```ts
import { TechnicalAnalysis, analyzeMultiTimeframe, rsi, latest } from "@nemesis-oss/dhanhq-sdk";

// Indicators are pure functions over number arrays
latest(rsi([100, 102, 101, 105 /* … */], 14));

// Or compute every timeframe at once and blend them into one bias
const analysis = new TechnicalAnalysis(client.charts);
const result = await analysis.compute({
  securityId: "13",
  exchangeSegment: "IDX_I",
  instrument: "INDEX",
  intervals: [5, 15, 60],
});

analyzeMultiTimeframe(result).summary;
// { bias: "bullish", setup: "buy_on_dip", confidence: 0.81, … }
```

Every indicator returns an array the same length as its input, with `null`
where there is not yet enough data — so indicator output can be indexed by bar
without re-aligning it.

---

### 7. Option Analytics

```ts
import { greeks, impliedVolatility, maxPain, openInterestFromChain } from "@nemesis-oss/dhanhq-sdk";

greeks({
  spot: 24_000,
  strike: 24_200,
  timeToExpiry: 10 / 365,
  riskFreeRate: 0.065,
  volatility: 0.15,
  optionType: "call",
});

maxPain(openInterestFromChain(chain));
```

---

### 8. Risk Pipeline

```ts
import { Pipeline, riskProviderFor } from "@nemesis-oss/dhanhq-sdk";

const pipeline = new Pipeline({
  provider: riskProviderFor(client),
  limits: { maxQuantity: 50, dailyMaxLoss: 25_000 },
});

// Throws RiskViolationError on the first failure …
await pipeline.run({ args: order, instrument });

// … or collect every violation for a preview
const { passed, violations } = await pipeline.report({ args: order, instrument });
```

Checks cover trading permission, ASM/GSM restrictions, product support,
order type, quantity and notional, market hours, position count,
single-symbol concentration, daily loss, and options-specific rules. Account
checks are skipped — not failed — when no data provider is configured, so the
pipeline stays usable offline for order-shape validation.

These checks encode NSE/BSE rules and resolve instruments from the Indian
scrip master; they do not apply to non-Indian books.

---

### 9. Skills

Skills are named sequences of steps over a shared context. The structure
skills stop at an `intent` — they resolve strikes and premiums but never place
orders, leaving execution to an explicit, separately-gated call.

```ts
import { createSkillRegistry } from "@nemesis-oss/dhanhq-sdk";

const skills = createSkillRegistry();

const { intent } = await skills.call(
  "iron_condor",
  { symbol: "NIFTY", expiry: "2026-02-26", wingWidth: 200 },
  client,
);
```

| Skill | Risk | Scope |
| --- | --- | --- |
| `buy_atm_call`, `straddle`, `strangle` | `trade_adjacent_read` | `orders:read` |
| `iron_condor`, `bull_put_spread`, `bear_call_spread` | `trade_adjacent_read` | `orders:read` |
| `covered_call`, `protective_put` | `trade_adjacent_read` | `orders:read` |
| `market_data_summarizer` | `read_only` | `market:read` |
| `square_off_all`, `square_off_position` | `destructive_write` | `orders:write` |

---

### 10. Agent Tools and MCP

Every resource, analysis helper and skill is exposed as a tool behind a
permission policy.

```ts
import { AgentToolRegistry, Policy } from "@nemesis-oss/dhanhq-sdk";

const tools = new AgentToolRegistry({ client, policy: Policy.readOnly() });

await tools.execute("dhan_search_instruments", { query: "NIFTY" });
await tools.execute("dhan_order_preview", order); // validation + risk, places nothing
```

Two independent gates guard writes: the policy must hold the scope, **and**
both `DHANHQ_MCP_ENABLE_WRITES=true` and `LIVE_TRADING=true` must be set.
Read tools need only the scope.

Run the MCP server over stdio:

```bash
DHAN_CLIENT_ID=... DHAN_ACCESS_TOKEN=... npx dhanhq-mcp
```

Claude Desktop / MCP client configuration:

```json
{
  "mcpServers": {
    "dhanhq": {
      "command": "npx",
      "args": ["-y", "@nemesis-oss/dhanhq-sdk", "dhanhq-mcp"],
      "env": {
        "DHAN_CLIENT_ID": "...",
        "DHAN_ACCESS_TOKEN": "...",
        "DHANHQ_AGENT_SCOPES": "portfolio:read,market:read,orders:read"
      }
    }
  }
}
```

The server exposes tools, six account resources (`dhanhq://account/*`,
`dhanhq://market/capabilities`) and five prompt templates.

---

### 11. WebSocket Execution Orchestration

The WebSocket is the real-time truth source. `OrderTracker` resolves a placed
order to its fill using order-update events instead of polling
`GET /orders/{id}`, and `PositionMonitor` turns market ticks into exit signals.

```ts
import { OrderTracker, PositionMonitor } from "@nemesis-oss/dhanhq-sdk";

const tracker = new OrderTracker();
const monitor = new PositionMonitor();

client.ws.orders.on("order", (state) => tracker.onOrderUpdate(state));
client.ws.market.on("tick", (tick) => monitor.onTick(tick));

// Register the waiter *before* placing — a fast fill can beat the HTTP response.
const correlationId = "entry-001";
const settled = tracker.waitFor(correlationId, { timeoutMs: 60_000 });
await client.orders.place({ correlationId, /* … */ });
const fill = await settled; // { status: "TRADED", filledQuantity, averagePrice }

monitor.track({
  securityId: "2885",
  exchangeSegment: "NSE_EQ",
  quantity: fill.filledQuantity,
  entryPrice: fill.averagePrice!,
  stopLoss: 1386,
  target: 1428,
  trail: { atr: 7, multiplier: 2 },
});

monitor.on("exit", async (signal) => {
  // stop_loss | target | trailing_stop
  console.log(signal.reason, signal.pnl);
});
```

`PositionMonitor` only *decides* — it never places an order, so the same
instance drives a live exit, a paper log, or an alert. It emits exactly one
exit per position, checks the stop before the target when a tick gaps through
both, and ratchets the trailing stop upward only.

Full loop in [`examples/ws-execution.ts`](examples/ws-execution.ts).

---

### 12. Account-Level Risk Controls

The pre-trade pipeline stops a bad order before it is sent. These stop the
damage after it accumulates — and they keep working when your process does not.

```ts
// Auto-square-off everything at +₹5,000 or −₹2,500
await client.traderControls.setPnlExit({
  profitValue: 5_000,
  lossValue: 2_500,
  enableKillSwitch: true,     // block re-entry once the book is flattened
  productType: ["INTRADAY"],
});
await client.traderControls.getPnlExit();
await client.traderControls.stopPnlExit();

// Emergency stop: blocks trading for the rest of the day
await client.traderControls.setKillSwitch("ACTIVATE");
```

Through the agent layer these sit on `risk:write`, deliberately separate from
`orders:write` — an agent allowed to trade cannot disarm the account's own
safety rails as a side effect.

See [`examples/risk-controls.ts`](examples/risk-controls.ts).

---

### 13. Global Stocks (US Equities)

A separate book under `/v2/globalstocks/*`: balances in USD, fractional
quantities, and no exchange segment, product type or validity on orders.

```ts
await client.globalStocks.marketStatus.isOpen();
await client.globalStocks.funds.getLimit();       // USD, not INR
await client.globalStocks.holdings.list();

// Charges + margin in one affordability decision
const { sufficient, totalMargin } = await client.globalStocks.costSummary({
  securityId: "AAPL", transactionType: "BUY", price: 190, quantity: 2,
});

await client.globalStocks.orders.place({
  transactionType: "BUY", orderType: "LIMIT",
  securityId: "AAPL", quantity: 0.5, price: 190,   // fractional shares
  targetPrice: 205, stopLossPrice: 180,
});

// AMOUNT orders spend a dollar value instead of buying a share count
await client.globalStocks.orders.place({
  transactionType: "BUY", orderType: "AMOUNT", securityId: "MSFT", amount: 100,
});
```

Kept in its own namespace so USD and INR positions never blend — an agent
asked for "my holdings" gets one book or the other, never a mix.

The domestic **risk pipeline does not apply here**: its checks resolve
instruments from the Indian scrip master and encode NSE/BSE rules. Global
Stocks writes are still gated by scope, the live-trading flag, and their own
order contract.

See [`examples/global-stocks.ts`](examples/global-stocks.ts).

---

## Architecture

```text
REST (OpenAPI Generated)
    ↓
Resources Layer  ──────────────┐
    ↓                          │
Validation + Safe Transport    │
    ↓                          ↓
WebSocket Engine        TA / Analytics / Risk
                               ↓
                        Skills → Agent Tools → MCP Server
```

---

## Key Concepts

### 1. Correlation ID (MANDATORY)

Every trading order should include a `correlationId` for:

- recovery via `/orders/external/{id}` after an uncertain write
- traceability across order placement and execution updates

`correlationId` is a **correlation tag, not an idempotency key**. Dhan does not
de-duplicate on it: re-sending the same POST with the same `correlationId` can
create a second order. After a timeout or connection failure on placement:

```text
POST /orders  →  timeout / network error
      ↓
DO NOT replay the POST
      ↓
GET /orders/external/{correlationId}  (client.orders.getByCorrelationId)
      ↓
order exists → track it; not found → decide explicitly whether to re-place
```

---

### 2. WebSocket is the Real-time Truth Source

- LTP should come from WebSocket, not REST polling
- execution and exit logic should react to WS events
- REST is for placement, reconciliation, and history

---

### 3. No Blind Retries

Order placement is **never auto-retried**.

Only safe retries are allowed for non-order operations such as:

- transient network failures
- selected `5xx` responses
- auth refresh on `401` when a token provider is configured

---

## Environment Support

| Feature | Node | Browser |
| --- | --- | --- |
| Indicators, analytics, position sizing | ✅ | ✅ pure functions, no credentials |
| `PositionMonitor` exit signals | ✅ | ✅ feed it ticks from your own socket |
| REST API | ✅ | ❌ needs a token, and `api.dhan.co` sends no CORS headers |
| WebSocket Feed | ✅ | ❌ needs a token |
| Order Placement | ✅ | ❌ |
| Agent tools / MCP server | ✅ | ❌ Node-only |

The browser blockers are independent: a Dhan access token is a bearer
credential for a live trading account and must never ship to a client, **and**
the REST API sends no `Access-Control-Allow-Origin`, so the browser blocks the
response regardless. Run the SDK on a server and expose a narrow read-only API
to your frontend — see [`docs/BROWSER.md`](docs/BROWSER.md) for the pattern.

For the browser side of that pattern, import from the dedicated
`@nemesis-oss/dhanhq-sdk/browser` entry point rather than the main one —
it's a separate build with `src/client`/`src/resources`/`src/ws` structurally
absent from its module graph, not just tree-shaken out by a cooperative
bundler:

```ts
import { rsi, greeks, PositionMonitor } from "@nemesis-oss/dhanhq-sdk/browser";
```

---

## Examples

See `/examples`:

| Example | Covers |
| --- | --- |
| `basic.ts` | Client setup and a first call |
| `place-order.ts` | Order placement with validation |
| `ws-feed.ts` | Subscribing to the market feed |
| `full-bot.ts` | End-to-end bot skeleton |
| `ws-execution.ts` | Fill tracking and tick-driven exits (`DRY_RUN=true` by default) |
| `risk-controls.ts` | Pipeline, P&L auto-exit and kill switch (`APPLY=true` to arm) |
| `global-stocks.ts` | US equities book (`PLACE_ORDER=true` to transmit) |
| `analysis-and-skills.ts` | Indicators, option analytics, skills and agent tools |

---

## Less Common Features

Fully wired, tested resources that don't come up in day-to-day usage enough
to earn their own Quick Start step. Plain string literals work directly —
`place()`/`form()`/etc. accept string-literal-typed request shapes derived
from the generated OpenAPI enums, not the raw enums themselves.

### Forever Orders (GTT)

```ts
await client.foreverOrders.place({
  transactionType: "BUY",
  exchangeSegment: "NSE_EQ",
  productType: "CNC",
  orderType: "LIMIT",
  securityId: "1333",
  quantity: 10,
  price: 1450,
  triggerPrice: 1460,
});

const pending = await client.foreverOrders.list();
await client.foreverOrders.cancel(pending[0].orderId!);
```

### Conditional Trigger Orders

Price- or indicator-based triggers, distinct from Forever Orders — see
`/v2/alerts/orders`. Supports crossing a price level, an indicator value
(RSI, SMA, ...), or one indicator crossing another.

```ts
// Buy a NIFTY option once the Nifty spot crosses 24,500
await client.conditionalTriggers.place({
  dhanClientId: process.env.DHAN_CLIENT_ID!,
  condition: {
    comparisonType: "PRICE_WITH_VALUE",
    exchangeSegment: "IDX_I",
    securityId: "13", // Nifty 50 index
    operator: "GREATER_THAN",
    comparingValue: 24500,
    frequency: "ONCE",
  },
  orders: [
    {
      transactionType: "BUY",
      exchangeSegment: "NSE_FNO",
      productType: "INTRADAY",
      orderType: "MARKET",
      validity: "DAY",
      securityId: "44000", // the FNO contract to buy when triggered
      quantity: 50,
    },
  ],
});
```

Or build the condition with a helper instead of writing it by hand:

```ts
const condition = ConditionalTriggers.buildPriceCondition({
  exchangeSegment: "IDX_I",
  securityId: "13",
  triggerAbove: 24500,
});
```

### eDIS (Electronic Delivery Instruction Slip)

Required to sell holdings that aren't already pledged/POA-authorized —
generates the CDSL/NSDL authorization form.

```ts
await client.edis.form({
  isin: "INE002A01018", // Reliance
  qty: 10,
  exchange: "NSE",
  segment: "EQ",
  bulk: false,
});

const status = await client.edis.getQuantityStatus("INE002A01018");
```

### Static IP Whitelisting

```ts
await client.ipSetup.set({ ip: "203.0.113.10", ipFlag: "PRIMARY" });
const current = await client.ipSetup.get();
```

---

## Development

```bash
npm install
npm run build
npm run typecheck
npm test -- --runInBand
```

Releasing is documented in [`docs/RELEASING.md`](docs/RELEASING.md).

### Smoke Test

```bash
npm run smoke
```

Relies on `.env` carrying `DHAN_TOKEN` and `DHAN_CLIENT_ID`.

Repository:

```text
https://github.com/shubhamtaywade82/dhanhq-sdk
```

---

## Generate API Client

```bash
npm run generate
```

This uses `openapi.json` to regenerate the typed API layer under `src/generated`.

---

## Project Structure

```text
src/
  agent/         # Policy, tool catalogue, registry, order preview
  ai/            # prompt helpers for LLM assistants
  analytics/     # Black-Scholes, Greeks, IV, max pain, PCR
  auth/          # token helpers, TOTP, token lifecycle
  bin/           # dhanhq-mcp executable
  client/        # DhanClient, transport coordination, generated bootstrap
  contracts/     # runtime validation for trading-critical requests
  errors/        # normalized SDK error types
  execution/     # order fill tracking and tick-driven exit signals
  generated/     # OpenAPI-generated low-level client
  mcp/           # JSON-RPC 2.0 stdio MCP server
  resources/     # public SDK resource surface
  risk/          # pre-trade check pipeline, position sizing, trailing stops
  skills/        # composable trading strategies (11 builtins)
  ta/            # indicators, candles, market calendar, multi-timeframe bias
  types/         # shared TypeScript types
  ws/            # market feed, order updates, packet parsers, stores
  constants.ts   # exchange segments, product/order types, rate limits
```

---

## Safety Notes (READ THIS)

- Do not expose API tokens in frontend code
- Do not retry order placement automatically
- Always validate trading inputs before transport
- Use WebSocket for exit logic and execution-time state
- Prefer `correlationId` on every strategy-originated order

---

## Authentication

Five ways to supply a token, covered in full in
[`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md):

```ts
// 1. Static token
new DhanClient({ clientId, token });

// 2. Provider callback, re-resolved on every request
new DhanClient({ clientId, tokenProvider: () => vault.read("dhan/token") });

// 3. Automatic: generate from PIN + TOTP, renew before expiry
client.auth.enableAutoTokenManagement({ clientId, pin, totpSecret });

// 4. From DHAN_CLIENT_ID / DHAN_ACCESS_TOKEN, failing fast if unset
DhanClient.fromEnv();

// 5. From a token endpoint of your own
await DhanClient.fromTokenEndpoint({ endpointBaseUrl, bearerToken });
```

Plus TOTP generation, direct `generateAccessToken` / `renewWebToken`, and
`SELF` / `PARTNER` auth for the order-update WebSocket.

Two behaviours worth knowing:

- **Concurrent callers share one login.** Generating a token can invalidate
  the previous one, so parallel logins risk leaving the SDK holding a token
  the broker already replaced.
- **Offset-less expiry timestamps are read as IST.** JavaScript parses them as
  *local* time, which on a UTC server reads an IST expiry 5.5 hours late — the
  token would look valid well after the API began rejecting it.

Auth failures raise `AuthenticationError` carrying the broker's own message
("Invalid PIN" and "TOTP expired" need different fixes, and the status code
does not distinguish them).

See `docs/` and `AGENTS.md` for repo-level architecture and trading constraints.

---

## Roadmap

- [x] Expand higher-level trading helpers beyond raw resource wrappers
- [x] Technical analysis, option analytics and a pre-trade risk pipeline
- [x] Composable skills, agent tools and an MCP server
- [x] Add deeper WebSocket examples for execution orchestration
- [x] Improve browser-safe read-only integration guidance
- [x] Add advanced risk management examples around pnl exit and kill switch
- [x] Global Stocks (US equities) book under `/v2/globalstocks/*`
- [ ] Global Stocks binary WebSocket feed
- [x] Backtesting harness over the indicator layer

---

## License

MIT
