---
title: Live Testing — DhanHQ TypeScript SDK
description: Verify credentials, every read endpoint, the WebSocket feed and a tiny order round-trip against the real Dhan hosts with npm run live-check.
---

# Live Testing

Unit tests stub the network. Before trusting a deployment with money, run
`scripts/live-check.ts` against the real hosts: it calls every read endpoint,
opens the market feed and — only when asked — places one tiny order and
cancels it.

```bash
git clone https://github.com/shubhamtaywade82/dhanhq-sdk && cd dhanhq-sdk
npm ci
cp .env.example .env   # fill in credentials — .env is git-ignored
```

## 1. Read-only checks

```bash
npm run live-check
npm run live-check -- --ws     # + one market-feed tick (market hours)
```

Each check prints `[OK]`, `[ERR]` or `[N/A]` (not served by the sandbox), and
the run exits non-zero on any error. The header shows the mode, how the client
authenticated, and which host orders and market data go to:

```text
Mode: hybrid
Auth: PIN/TOTP login, cached token reused while valid
Routing: orders -> sandbox.dhan.co, market data -> api.dhan.co
```

## 2. Order round-trip on the sandbox (zero risk)

```bash
DHAN_MODE=hybrid npm run live-check -- --ws --place-test-order
```

Needs `DHAN_SANDBOX_CLIENT_ID` and `DHAN_SANDBOX_ACCESS_TOKEN`. The price
comes from the live LTP; the order goes to the sandbox.

## 3. Order round-trip on production (real order)

```bash
LIVE_TRADING=true npm run live-check -- --ws --place-test-order
```

The test order is a **1-share CNC LIMIT BUY** of `TEST_SECURITY_ID`
(default `1333`, HDFCBANK on `NSE_EQ`), priced `TEST_ORDER_OFFSET_PCT`
(default 5, clamped to 2–15) **below** the LTP so it rests unfilled. The
script then cancels it and confirms the cancel.

Safeguards:

- On the production host it refuses to run without `LIVE_TRADING=true`.
- A failed placement is reconciled by `correlationId`, never retried — a
  timeout may still have reached the exchange.
- If the order fills anyway, the script says so loudly. You then hold one
  share and sell it yourself.

Keep enough balance for one share. `TEST_ORDER_PRICE` sets an explicit limit
(required in full `sandbox` mode, which has no live LTP).

## Settings

| Variable | Default | Purpose |
|----------|---------|---------|
| `DHAN_MODE` | `live` | `live`, `sandbox` or `hybrid` |
| `DHAN_CLIENT_ID` | — | production client id |
| `DHAN_PIN` + `DHAN_TOTP_SECRET` | — | PIN/TOTP login with token cache |
| `DHAN_ACCESS_TOKEN` (or `DHAN_TOKEN`) | — | static token, when PIN/TOTP is not set |
| `DHAN_SANDBOX_CLIENT_ID` / `DHAN_SANDBOX_ACCESS_TOKEN` | — | sandbox credentials |
| `TEST_EXCHANGE_SEGMENT` | `NSE_EQ` | test instrument segment |
| `TEST_SECURITY_ID` | `1333` | test instrument |
| `TEST_ORDER_OFFSET_PCT` | `5` | how far below LTP to price the BUY (2–15) |
| `TEST_ORDER_PRICE` | — | explicit limit price |
| `LIVE_TRADING` | — | must be `true` to place on production |

## Reading failures

| Output | Meaning |
|--------|---------|
| `[ERR] ... SandboxCredentials failed` | hybrid mode without sandbox credentials |
| `[ERR] ... rejected with 401 by the Dhan sandbox` | wrong / expired sandbox token |
| `[ERR] ... status 401` on production | token expired or replaced — with PIN/TOTP the next run logs in again |
| `[N/A]` | endpoint not served by the sandbox — expected |
| `no tick within 15s` | market closed, or WebSocket blocked by a firewall |
| `TEST ORDER FILLED` | the limit was reached — sell the share |
