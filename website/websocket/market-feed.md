---
title: DhanHQ WebSocket Market Feed — TypeScript & Node.js
description: Stream real-time market data (LTP, OHLCV, depth) over WebSocket with the DhanHQ TypeScript SDK. Subscribe to equities, indices, F&O, and commodities.
---

# WebSocket Market Feed

Stream real-time LTP, OHLCV, and market depth over WebSocket — the low-latency alternative to REST polling.

## Connection

```ts
await client.ws.connect();

// Wait for the market feed socket to open
client.ws.market.once("open", () => {
  console.log("Market feed connected");
});
```

## Subscribe to Instruments

Subscribe **before** connecting — subscriptions queue up and auto-send on open:

```ts
client.ws.market.subscribe([
  { exchangeSegment: "NSE_EQ", securityId: "1333" },   // HDFCBANK
  { exchangeSegment: "NSE_FNO", securityId: "58072" }, // NIFTY FUT
  { exchangeSegment: "IDX_I", securityId: "13" },      // NIFTY 50
  { exchangeSegment: "MCX_COMM", securityId: "466583" }, // GOLD FUT
]);

await client.ws.connect();
```

## Tick Events

```ts
client.ws.market.on("tick", (tick) => {
  console.log(tick.exchangeSegment, tick.securityId, tick.ltp);
  // Full payload:
  //   ltp, volume, openInterest
  //   dayHigh, dayLow, dayOpen, dayClose
  //   5-level bid/ask (depth)
});
```

## Market Depth

Enable 20-level (default) or 200-level depth:

```ts
client.ws.enableDepth("twenty");    // default: 20 levels
client.ws.enableDepth("twohundred"); // 200 levels, one instrument per connection

client.ws.depth?.subscribe([
  { exchangeSegment: "NSE_EQ", securityId: "1333" },
]);

client.ws.depth?.on("depth", (event) => {
  console.log(event.levels); // top bid/ask levels
});

// The server drops an instrument (e.g. exchange-side issue) with a reason code
client.ws.depth?.on("disconnect", (event) => {
  console.warn("depth stopped", event.securityId, event.reasonCode);
});
```

Limits per connection: **50 instruments** for 20-level, **1** for 200-level.
Subscribing beyond them throws a `DhanError` with code
`DEPTH_SUBSCRIPTION_LIMIT` — the server would otherwise drop them silently.
Open another `MarketDepthWS` for more.

## Unsubscribe

```ts
client.ws.market.unsubscribe([
  { exchangeSegment: "NSE_EQ", securityId: "1333" },
]);
client.ws.depth?.unsubscribe([
  { exchangeSegment: "NSE_EQ", securityId: "1333" },
]);
```

Unsubscribe sends the request to Dhan (market feed codes 16/18/22 by mode,
depth code 24), so the server stops streaming — not only the local
subscription list.

## Market Status

Exchange status changes arrive as `market-status` events on the market feed:

```ts
client.ws.market.on("tick", (event) => {
  if (event.type === "market-status") console.log("market status packet", event.raw);
});
```

## Production Only

The WebSockets have no sandbox. In `hybrid` mode they stream production
data; sandbox orders do not appear on the order-update socket. See
[Live, Sandbox & Hybrid](/guide/environments#websockets-have-no-sandbox).

## Subscription Modes

| Mode | Description |
|------|-------------|
| `ticker` | LTP only (lightest) |
| `quote` | LTP + OHLCV + depth |
| `full` | Everything (default) |

```ts
// Set mode in DhanWS options, or use enableDepth()
```

## All Segments

The SDK supports all DhanHQ exchange segments:

| Segment | Description |
|---------|-------------|
| `NSE_EQ` | NSE Equities |
| `BSE_EQ` | BSE Equities |
| `NSE_FNO` | NSE F&O (Futures & Options) |
| `NSE_CURRENCY` | NSE Currency Derivatives |
| `BSE_CURRENCY` | BSE Currency Derivatives |
| `MCX_COMM` | MCX Commodities |
| `IDX_I` | Indices (NIFTY, BANKNIFTY, etc.) |
| `BSE_IDX_I` | BSE Indices |

## LTP Store

The SDK maintains an in-memory LTP store updated by the WebSocket feed:

```ts
const ltp = client.ws.ltpStore.get("NSE_EQ:1333");
console.log("Latest LTP:", ltp);
```

For the binary protocol reference, see the [WS Protocol docs](https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/docs/WS_PROTOCOL.md).
