---
title: DhanHQ Global Stocks API (US Equities) — TypeScript & Node.js
description: Trade US equities from the same DhanHQ account — USD funds, fractional shares, AMOUNT orders, holdings, trades, market status and margin — using the DhanHQ TypeScript SDK.
---

# Global Stocks (US Equities)

Global Stocks is a separate DhanHQ book for US equities, served from
`/v2/globalstocks/*`. It behaves differently from the domestic book in ways
that matter:

- Balances are in **USD**, not INR
- **Fractional** quantities are allowed (`quantity: 0.5`)
- Orders take no exchange segment, product type or validity
- An `AMOUNT` order type spends a dollar value instead of buying a share count

The SDK keeps it in its own namespace — `client.globalStocks` — so USD and INR
positions never blend. An agent asked for "my holdings" gets one book or the
other, never a mix.

## Market Status

```ts
const open = await client.globalStocks.marketStatus.isOpen();
console.log("US market open:", open);
```

## Funds & Holdings

```ts
// USD fund limits — separate from the domestic INR balance
const funds = await client.globalStocks.funds.getLimit();
console.log(funds.availableCash); // USD

// US holdings
const holdings = await client.globalStocks.holdings.list();

// Total current value of the US book, in USD
const total = await client.globalStocks.holdings.totalCurrentValue();
```

## Place Orders

```ts
// Limit buy with optional target / stop
const order = await client.globalStocks.orders.place({
  transactionType: "BUY",
  orderType: "LIMIT",
  securityId: "AAPL",
  quantity: 0.5,          // fractional shares
  price: 190,
  targetPrice: 205,
  stopLossPrice: 180,
});
console.log(order.data.orderId);
```

`AMOUNT` orders spend a dollar value instead of a share count:

```ts
await client.globalStocks.orders.place({
  transactionType: "BUY",
  orderType: "AMOUNT",
  securityId: "MSFT",
  amount: 100,            // buy $100 worth of MSFT
});
```

Modify, cancel and fetch mirror the domestic orders API:

```ts
await client.globalStocks.orders.modify({
  orderId: order.data.orderId!,
  transactionType: "BUY",
  orderType: "LIMIT",
  securityId: "AAPL",
  quantity: 1,
  price: 188,
});

await client.globalStocks.orders.cancel(orderId);
const book = await client.globalStocks.orders.list();
const one = await client.globalStocks.orders.getById(orderId);
```

## Trades

```ts
const trades = await client.globalStocks.trades.list();
const aaplTrades = await client.globalStocks.trades.bySecurityId("AAPL");
```

## Charges + Margin in One Step

`costSummary()` runs the transaction estimate and the margin calculator in
parallel and reconciles them, so affordability is one decision:

```ts
const { sufficient, totalCharges, totalMargin } =
  await client.globalStocks.costSummary({
    securityId: "AAPL",
    transactionType: "BUY",
    price: 190,
    quantity: 2,
  });

console.log("Charges (USD):", totalCharges);
console.log("Margin required (USD):", totalMargin);
console.log("Affordable:", sufficient);
```

The lower-level pieces are also available separately:
`globalStocks.margin.estimate()` (brokerage and statutory charges) and
`globalStocks.margin.calculate()` (margin requirement).

::: warning
The domestic **risk pipeline does not apply here** — its checks resolve
instruments from the Indian scrip master and encode NSE/BSE rules. Global
Stocks writes are still gated by scope, the live-trading flag, and their own
order contract in the agent layer.
:::

Runnable example: [`examples/global-stocks.ts`](https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/examples/global-stocks.ts)
(`PLACE_ORDER=true` to transmit).

DhanHQ reference: [Global Stocks](https://docs.dhanhq.co/api/v2/global-stocks).
