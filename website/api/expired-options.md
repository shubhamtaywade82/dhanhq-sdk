---
title: DhanHQ Expired Options Data API — TypeScript & Node.js
description: Fetch historical rolling options data for expired F&O contracts — minute-level OHLC, IV, volume, OI and spot by ATM-relative strike — using the DhanHQ TypeScript SDK.
---

# Expired Options Data

Fetch historical data for **expired** F&O options contracts — the data that
vanishes from the live option chain once a contract expires. DhanHQ serves this
through the *Historical Rolling Options Data* endpoint (`POST /charts/rollingoption`),
and the SDK exposes it as `client.expiredOptionsData`.

This is the data you need to backtest options strategies against real expired
contracts: minute-level OHLC, implied volatility, volume, open interest and the
underlying spot, addressed by strike **relative to ATM** rather than by absolute
strike price.

- Rolling basis: ask for `ATM`, `ATM+3`, `ATM-2`, etc. — the series follows whichever
  contract was at that distance from the money
- Up to 5 years of history, index options and stock options
- Keep each request short — Dhan's guide quotes ~30 days of data per call —
  and page through longer ranges
- `toDate` is **non-inclusive**: a range of `2026-01-01` → `2026-02-01` returns
  data through January 31

## Fetch Expired Options Data

Index options use `instrument: "OPTIDX"` and the **underlying** security ID
(`13` = NIFTY 50, `25` = NIFTY Bank), not the option contract's own ID:

```ts
// NIFTY weekly ATM call, January 2026
const response = await client.expiredOptionsData.fetch({
  securityId: 13,              // NIFTY 50 — the UNDERLYING, not the contract
  exchangeSegment: "NSE_FNO",
  instrument: "OPTIDX",        // index options (use "OPTSTK" for stock options)
  expiryFlag: "WEEK",          // "WEEK" | "MONTH" — not "WEEKLY"/"MONTHLY"
  expiryCode: 1,               // 1 = Near, 2 = Next, 3 = Far expiry
  strike: "ATM",
  drvOptionType: "CALL",
  interval: "15",              // 1 | 5 | 15 | 25 | 60 minutes
  requiredData: ["open", "high", "low", "close", "volume", "oi", "iv", "spot"],
  fromDate: "2026-01-01",
  toDate: "2026-02-01",        // non-inclusive
});
```

For a stock option, pass the stock's own security ID with `instrument: "OPTSTK"`:

```ts
// RELIANCE monthly ATM put, December 2025
const putData = await client.expiredOptionsData.fetch({
  securityId: 2885,            // RELIANCE (NSE_EQ ID, used as the underlying)
  exchangeSegment: "NSE_FNO",
  instrument: "OPTSTK",
  expiryFlag: "MONTH",
  expiryCode: 1,
  strike: "ATM",
  drvOptionType: "PUT",
  fromDate: "2025-12-01",
  toDate: "2026-01-01",
});
```

::: warning
Use `"WEEK"` and `"MONTH"` for `expiryFlag`. The Dhan API's enum is
`WEEK | MONTH` — values like `"WEEKLY"`/`"MONTHLY"` are sent over the wire
unchanged and will be rejected by the API.
:::

## Request Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `securityId` | `string \| number` | Security ID of the **underlying** (13 = NIFTY 50, 25 = NIFTY Bank, 2885 = RELIANCE) |
| `exchangeSegment` | `string` | `NSE_FNO` or `BSE_FNO` for F&O contracts |
| `instrument` | `string` | `OPTIDX` (index options) or `OPTSTK` (stock options). `INDEX`, `FUTIDX`, `FUTSTK`, `EQUITY` are also accepted by Dhan's charts annexure |
| `expiryFlag` | `string` | `WEEK` or `MONTH` |
| `expiryCode` | `number` | `1` = Near, `2` = Next, `3` = Far expiry |
| `strike` | `string` | ATM-relative strike — see below |
| `drvOptionType` | `string` | `CALL` or `PUT` |
| `interval` | `string` | Minute interval: `"1"`, `"5"`, `"15"`, `"25"`, `"60"` |
| `requiredData` | `string[]` | Fields to return: `open`, `high`, `low`, `close`, `iv`, `volume`, `strike`, `oi`, `spot` |
| `fromDate` | `string` | Start date, `YYYY-MM-DD` |
| `toDate` | `string` | End date, `YYYY-MM-DD` — **non-inclusive** |
| `autoAdjustDates` | `boolean` | SDK-only. Default `true` — see [Date normalization](#automatic-date-normalization) |

Instead of `instrument`, the SDK also accepts `instrumentType: "INDEX" | "STOCK"`,
which it maps onto `instrument` before sending. `instrument: "OPTIDX"`/`"OPTSTK"`
matches Dhan's own documentation and is the recommended form.

## Strike Selection

`strike` is expressed relative to the at-the-money strike of the moment, so the
series rolls across expiries without you tracking absolute strikes:

- `ATM` — at the money
- `ATM+1` … `ATM+3`, `ATM-1` … `ATM-3` — up to ±3 strikes on most contracts
- `ATM+10` … `ATM-10` — up to ±10 strikes on **index options near expiry**

One call fetches a single option type. For a straddle you make two calls —
`drvOptionType: "CALL"` and `"PUT"` — with everything else identical.

## Response

Dhan returns the two legs as **parallel arrays** under `data.ce` / `data.pe`.
Treat each leg as nullable — `pe` is `null` in the example below because the
request asked for a `CALL`:

```json
{
  "data": {
    "ce": {
      "open": [354, 360.3],
      "high": [],
      "low": [],
      "close": [],
      "volume": [],
      "iv": [],
      "oi": [],
      "strike": [],
      "spot": [],
      "timestamp": [1756698300, 1756699200]
    },
    "pe": null
  }
}
```

`timestamp` values are epoch **seconds**; every other array aligns with it by index.

The SDK returns the parsed JSON as-is (its response type carries a permissive
index signature). Type the real shape locally:

```ts
interface RollingOptionLeg {
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
  iv?: number[];
  oi?: number[];
  strike?: number[];
  spot?: number[];
  timestamp?: number[]; // epoch seconds
}

interface RollingOptionResponse {
  data?: { ce?: RollingOptionLeg | null; pe?: RollingOptionLeg | null };
}

const result = response as unknown as RollingOptionResponse;
const closes = result.data?.ce?.close ?? [];
const times = (result.data?.ce?.timestamp ?? []).map((t) => new Date(t * 1000));
```

## Automatic Date Normalization

Before sending, the SDK runs `fromDate`/`toDate` through the market calendar
(`adjustTradingDateRange` with a 180-day ceiling) unless you disable it:

- Weekends and NSE holidays shift back to the nearest trading session
- A future `toDate` clamps to the latest completed trading day
- Ranges longer than 180 days fail validation instead of erroring at the broker

```ts
// Strict mode — send dates exactly as given, errors surface from the API
const strict = await client.expiredOptionsData.fetch({
  securityId: 13,
  exchangeSegment: "NSE_FNO",
  instrument: "OPTIDX",
  expiryFlag: "WEEK",
  expiryCode: 1,
  strike: "ATM",
  drvOptionType: "CALL",
  fromDate: "2026-01-01",
  toDate: "2026-02-01",
  autoAdjustDates: false,
});
```

Invalid requests throw a `ValidationError` before any HTTP call is made —
malformed dates, a missing `instrument`, or a range that exceeds 180 days
never reach the broker.

## Backtesting Over the Series

Because `close` is a plain number array, the SDK's indicators run over it
directly — this example computes a 14-period RSI over the ATM call's closing
premium:

```ts
import { latest, rsi } from "@nemesis-oss/dhanhq-sdk";

const rsiSeries = rsi(closes, 14);
console.log("Current RSI of the ATM CE premium:", latest(rsiSeries));
```

To walk a longer window than a single call allows, iterate month-sized ranges
and stitch the series, keeping the same `expiryFlag`/`expiryCode` so each window
resolves the same relative expiry.

## Where It Fits

| Need | Use |
| --- | --- |
| Live option chain (current expiries) | [`client.optionChain`](/api/option-chain) |
| Historical candles for equity/index/futures | [`client.charts`](/analytics/technical-analysis) |
| Historical data for **expired** options | `client.expiredOptionsData` (this page) |

DhanHQ reference: [Expired Options Data](https://docs.dhanhq.co/api/v2/expired-options-data)
and the [Historical Rolling Options Data endpoint](https://docs.dhanhq.co/api/v2/expired-options-data/get-expired-options-data).
