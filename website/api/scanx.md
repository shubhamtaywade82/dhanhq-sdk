---
title: ScanX Data APIs — DhanHQ TypeScript SDK
description: Company fundamentals, market movers, news headlines and server-computed technical indicators from DhanHQ's ScanX data APIs.
---

# ScanX Data

`client.scanx` wraps DhanHQ's ScanX data APIs (`POST /v2/data/*`). All four
are read-only, use the data-API rate tier, and are production only — in
`hybrid` mode they go to production with the production token; in `sandbox`
mode they throw `SandboxUnsupportedError`.

Responses are passed through as returned by Dhan; type them with the generic
parameter (`client.scanx.technical<MyShape>(...)`).

## Company Info

```ts
const info = await client.scanx.companyInfo({
  securityId: "1333",
  exchangeSegment: "NSE_EQ",
  instrument: "EQUITY",
  metrics: ["CO", "RATIOS", "SHP"], // overview, ratios, shareholding
});
```

## Market Movers

```ts
const movers = await client.scanx.marketMovers({
  exchangeSegment: "NSE_FNO",
  instrument: ["OPTIDX"],
  category: "HIGHEST_OI",   // OI_GAINERS, OI_LOSERS, TOP_VOLUME, PRICE_GAINERS, PRICE_LOSERS
  expiry: "2026-10-27",     // required for options/futures
  limit: 20,                // 1-100
});
```

## News Headlines

```ts
const news = await client.scanx.newsHeadline({
  categories: ["ALL"],
  limit: 10,                // 1-50
  universe: "PORTFOLIO",    // optional: PORTFOLIO or WATCHLIST
});
```

`dhanClientId` is filled from the client.

## Technical Indicators

```ts
const technicals = await client.scanx.technical({
  securityId: "13",
  exchangeSegment: "IDX_I",
  instrument: "INDEX",
  timeframe: "5",           // 1, 5, 15 or D
  indicators: ["SMA_20", "RSI_14", "MACD_HIST"],
});
```

Out-of-range limits throw `RangeError` before any request.
