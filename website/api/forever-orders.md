---
title: DhanHQ Forever Orders (GTT) API — TypeScript & Node.js
description: Place, modify, list and cancel Forever Orders (good-till-triggered orders) on the DhanHQ API using the DhanHQ TypeScript SDK.
---

# Forever Orders (GTT)

Forever Orders are DhanHQ's good-till-triggered orders: they stay with the
broker until the trigger condition is met or you cancel them — for up to one
year. Use them for stop-losses and targets that outlive a trading session,
without leaving your system running.

The SDK exposes the `POST/PUT/DELETE/GET /forever/orders` endpoints through
`client.foreverOrders`.

## Place a Forever Order

A single-leg trigger order — buy 10 HDFC Bank only if it trades at or below
1,450:

```ts
await client.foreverOrders.place({
  transactionType: "BUY",
  exchangeSegment: "NSE_EQ",
  productType: "CNC",
  orderType: "LIMIT",
  securityId: "1333",     // HDFC Bank
  quantity: 10,
  price: 1450,
  triggerPrice: 1460,
  validity: "1Year",      // "1Year" | "Expiry"
});
```

### OCO (One-Cancels-Other)

Pass `orderFlag: "OCO"` with the second leg's target fields — `triggerPrice`
fires the order, while `price1`/`triggerPrice1`/`quantity1` define the target
leg:

```ts
await client.foreverOrders.place({
  orderFlag: "OCO",
  transactionType: "BUY",
  exchangeSegment: "NSE_EQ",
  productType: "CNC",
  orderType: "LIMIT",
  securityId: "1333",
  quantity: 10,
  price: 1450,
  triggerPrice: 1460,     // entry trigger
  price1: 1600,           // target price
  triggerPrice1: 1590,    // target trigger
  quantity1: 10,          // target quantity
  validity: "1Year",
});
```

## List Forever Orders

```ts
const orders = await client.foreverOrders.list();

for (const order of orders) {
  console.log(order.orderId, order.orderStatus, order.transactionType);
}
```

## Modify a Forever Order

```ts
await client.foreverOrders.modify(orderId, {
  orderType: "LIMIT",
  quantity: 20,
  price: 1440,
  triggerPrice: 1450,
});
```

## Cancel a Forever Order

```ts
await client.foreverOrders.cancel(orderId);
```

## Request Fields

| Field | Description |
| --- | --- |
| `orderFlag` | `SINGLE` (default) or `OCO` |
| `transactionType` | `BUY` or `SELL` |
| `exchangeSegment` | `NSE_EQ`, `NSE_FNO`, `BSE_EQ`, `BSE_FNO` |
| `productType` | `CNC`, `MTF`, `MARGIN`, `INTRADAY` (per segment support) |
| `orderType` | `LIMIT` or `MARKET` |
| `securityId` | Instrument security ID |
| `quantity` | Order quantity |
| `price` | Limit price |
| `triggerPrice` | Trigger price |
| `price1` / `triggerPrice1` / `quantity1` | Target leg — OCO orders only |
| `validity` | `"1Year"` or `"Expiry"` |
| `correlationId` | Optional idempotency key you supply |

Forever orders are **writes** — the SDK never retries them automatically, and
they are placed with `safeToRetry: false` so a timeout surfaces as an error for
you to reconcile (via `list()`) rather than a silent duplicate.

::: tip
Triggered-forever execution still needs eDIS authorization to sell certain
holdings — see [eDIS](/api/edis).
:::

DhanHQ reference: [Trading API overview](https://docs.dhanhq.co/api/v2/) —
Forever Orders are served from `/v2/forever/orders`.
