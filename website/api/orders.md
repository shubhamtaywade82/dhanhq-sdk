---
title: DhanHQ Orders API — TypeScript & Node.js
description: Place, modify, cancel, and query orders using the DhanHQ TypeScript SDK. Supports equity, F&O, currency, and commodity segments.
---

# Orders API

Place, modify, cancel, and query orders across NSE, BSE, NSE F&O, currency, and MCX segments.

## Place Order

```ts
const order = await client.orders.place({
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

console.log(order.data.orderId);
```

`place()` returns `{ correlationId, data }` — `correlationId` is either the
one you passed or an auto-generated one, useful for reconciling against the
WebSocket order-update stream even if the REST call times out.

### Correlation ID

Every order gets a `correlationId` — supply your own or one is generated —
for:
- **Recovery** — after an uncertain write, look up via
  `client.orders.getByCorrelationId(id)` before deciding anything
- **Traceability** — matches order placement to WebSocket fill updates

It is a correlation tag, **not an idempotency key** — Dhan does not
de-duplicate on it, so replaying a POST with the same `correlationId` can
create a second order. On a placement timeout the SDK throws `NetworkError`
and never re-sends; resolve the outcome with a lookup:

```ts
try {
  await client.orders.place({ ...params, correlationId: "entry-001" });
} catch (error) {
  if (error instanceof NetworkError) {
    // Outcome unknown: the order may or may not exist at the exchange.
    // If this lookup also fails, the outcome is STILL unknown — keep
    // watching the order-update WebSocket rather than re-placing.
    const existing = await client.orders.getByCorrelationId("entry-001");
    // existing → track it; only a confirmed "no such order" justifies a new,
    // explicitly-initiated placement
  }
}
```

```ts
const order = await client.orders.place({
  // ...other params
  correlationId: `strat-${Date.now()}`,
});

// Track via WebSocket
client.ws.orders.on("order", (update) => {
  if (update.correlationId === order.correlationId) {
    console.log("Fill update:", update);
  }
});
```

### Order Types

| OrderType | Description |
|-----------|-------------|
| `MARKET` | Executes at current market price |
| `LIMIT` | Executes at specified `price` or better |
| `STOP_LOSS` | Stop-loss (trigger) order |
| `STOP_LOSS_MARKET` | Stop-loss that converts to market |

### Product Types

| ProductType | Description |
|-------------|-------------|
| `INTRADAY` | Intraday (MIS) — squared off by EOD |
| `CNC` | Cash & Carry — held overnight |
| `MARGIN` | Carry Forward — F&O, currency, commodity |
| `BO` | Bracket order (entry + target + stop loss) |
| `CO` | Cover order (entry + stop loss) |
| `MTF` | Margin Trade Funding |

## Modify Order

```ts
await client.orders.modify({
  orderId: "12345",
  orderType: "LIMIT",
  price: 150.5,
  quantity: 20,
  validity: "DAY",
});
```

## Cancel Order

```ts
await client.orders.cancel("12345");
```

## Get Order by ID

```ts
const order = await client.orders.getById("12345");
```

## Get Order by Correlation ID

Look an order up by the `correlationId` you supplied at placement, rather
than Dhan's own `orderId` — useful when your own system only knows the
correlation ID it generated.

```ts
const order = await client.orders.getByCorrelationId("strategy-entry-001");
```

## List Orders and Trades

```ts
const orders = await client.orders.list();
const trades = await client.orders.listTrades();
const tradesForOrder = await client.orders.getTrades("12345");
```

## Trade History

Trades across a date range, not tied to a single order — paginated.

```ts
const history = await client.orders.getTradeHistory({
  fromDate: "2026-01-01",
  toDate: "2026-01-31",
  pageNumber: "0",
});
```

## Slice a Large Order

Same shape as `place()` — Dhan splits it server-side against freeze-quantity
limits, returning one response per resulting order.

```ts
const slices = await client.orders.placeSlice({
  dhanClientId: process.env.DHAN_CLIENT_ID!,
  exchangeSegment: "NSE_EQ",
  transactionType: "BUY",
  productType: "INTRADAY",
  orderType: "MARKET",
  validity: "DAY",
  securityId: "1333",
  quantity: 5000,
  correlationId: "slice-001",
});
```

## Super Orders

Multi-leg orders (entry + target + stop loss, with an optional trailing
jump) in a single call — one `place()`, not a bracket/cover-specific method:

```ts
const superOrder = await client.superOrders.place({
  dhanClientId: process.env.DHAN_CLIENT_ID!,
  transactionType: "BUY",
  exchangeSegment: "NSE_FNO",
  productType: "INTRADAY",
  orderType: "LIMIT",
  securityId: "12345",
  quantity: 15,
  price: 100,
  targetPrice: 110,
  stopLossPrice: 95,
  trailingJump: 1,
  correlationId: "super-entry-001",
});

await client.superOrders.modify({ orderId: superOrder.data.orderId, targetPrice: 112 });
await client.superOrders.cancel({ orderId: superOrder.data.orderId, orderLeg: "TARGET_LEG" });
```
