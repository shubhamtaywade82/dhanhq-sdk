---
title: Live, Sandbox & Hybrid Mode — DhanHQ TypeScript SDK
description: Route DhanHQ requests to production, the Dhan sandbox, or both — real market data with simulated execution — using one client.
---

# Live, Sandbox & Hybrid Mode

Dhan runs two separate hosts with **separate credentials**:

| Host | Base URL | Credentials |
|------|----------|-------------|
| Production | `https://api.dhan.co/v2` | Dhan web / PIN + TOTP login |
| Sandbox | `https://sandbox.dhan.co/v2` | [cloud.dhanhq.co](https://cloud.dhanhq.co) — sandbox client id + token |

A production token is rejected by the sandbox and vice versa. One client can
use both: `mode` decides where each request goes.

| `mode` | Market data, option chain, charts, ScanX, Global Stocks | Orders, positions, funds, statements, controls |
|--------|----------|----------|
| `live` (default) | production | production — **real money** |
| `sandbox` | sandbox | sandbox |
| `hybrid` | production (real prices) | sandbox (simulated fills) |

The instrument CSV always comes from production — it needs no credentials.

## Hybrid mode: real prices, simulated execution

Use it to rehearse a strategy end to end — signals from live quotes, orders
against the sandbox — before any rupee is at risk.

```ts
import { DhanClient } from "@nemesis-oss/dhanhq-sdk";

const client = new DhanClient({
  mode: "hybrid",
  clientId: process.env.DHAN_CLIENT_ID!,            // production — market data
  token: process.env.DHAN_ACCESS_TOKEN!,
  sandboxClientId: process.env.DHAN_SANDBOX_CLIENT_ID!, // sandbox — execution
  sandboxToken: process.env.DHAN_SANDBOX_ACCESS_TOKEN!,
});

const quote = await client.marketFeed.ltp({ NSE_EQ: ["1333"] }); // production
await client.orders.place({ /* ... */ });                         // sandbox
```

Or from the environment:

```bash
DHAN_MODE=hybrid
DHAN_CLIENT_ID=...            DHAN_ACCESS_TOKEN=...          # or DHAN_PIN + DHAN_TOTP_SECRET
DHAN_SANDBOX_CLIENT_ID=...    DHAN_SANDBOX_ACCESS_TOKEN=...
```

```ts
const client = DhanClient.fromEnv();
```

In hybrid mode the production side can use [PIN/TOTP login](/getting-started#_3-auto-renewal-pin-totp);
the sandbox side always uses its own static token.

## Guarantees

- **Trading never falls back to production.** In hybrid mode, a trading call
  without sandbox credentials throws `AuthenticationError` before any request.
- **Unsupported endpoints fail closed.** The sandbox serves only part of the
  API. Anything else throws `SandboxUnsupportedError` before any request
  instead of a 404 — and is never re-sent to production, which would turn a
  paper order into a real one. The [API mapping](https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/docs/API_MAPPING.md)
  marks every endpoint.
- **Sandbox 401s are not "fixed" with a production token.** They throw
  `AuthenticationError` naming `DHAN_SANDBOX_ACCESS_TOKEN`.
- **`dhanClientId` is rewritten** in sandbox request bodies, so code that
  fills it from the production client id still works.
- The raw generated client (`client.generated`) points at the sandbox
  whenever `mode` is not `live`.

### What the sandbox serves

Orders (place, modify, cancel, list, by id, by correlation id, slicing),
trades, holdings, positions and conversion, kill switch (activate/deactivate),
eDIS, fund limit, single-order margin, ledger, intraday/historical charts,
forever orders and profile.

### What it does not

Super orders, conditional and multi orders (`alerts`), P&L exit, kill-switch
status, multi-leg margin, static IP, market quotes, option chain, rolling
options, ScanX and Global Stocks. In `hybrid` mode the market-data ones among
these go to production; the trading ones throw `SandboxUnsupportedError`.

```ts
import { SandboxUnsupportedError } from "@nemesis-oss/dhanhq-sdk";

try {
  await client.superOrders.place(order);
} catch (error) {
  if (error instanceof SandboxUnsupportedError) {
    // rehearse with a plain order + separate SL order, or test this path live
  }
  throw error;
}
```

## WebSockets have no sandbox

The market feed, depth and order-update WebSockets exist only in production
and always connect with the primary `clientId` / token:

- **Hybrid** — market data streams normally. Order updates for **sandbox
  orders never arrive** on the order WebSocket; track them by polling
  `client.orders.getById()` (or `getByCorrelationId()`).
- **Sandbox** — the primary credentials are the sandbox's, which production
  rejects, so `connect()` on any socket (`client.ws.market`, `client.ws.orders`,
  depth) rejects at once with `SandboxUnsupportedError` instead of retrying
  forever. Use `hybrid` for streaming.

## Choosing a mode

| Goal | Mode |
|------|------|
| Unit tests | none — stub the HTTP layer (the SDK's own specs do) |
| Check request shapes against Dhan's validation | `sandbox` |
| Rehearse a strategy on live prices | `hybrid` |
| Trade | `live`, after a small [live test](/guide/live-testing) |
