---
title: DhanHQ Conditional Trigger Orders API — TypeScript & Node.js
description: Place order triggers on price levels or technical indicators (RSI, SMA crossings) via the DhanHQ alerts/orders API, using the DhanHQ TypeScript SDK.
---

# Conditional Trigger Orders

Conditional Triggers (DhanHQ's *Alert Orders*, `/v2/alerts/orders`) place real
orders when a **condition** is met: a price crossing a level, an indicator
crossing a value, or one indicator crossing another. Unlike [Forever
Orders](/api/forever-orders), which trigger on the order's own price, a
conditional trigger watches market data — including indicators — and can fire
multiple orders from one condition.

## Place a Price-Based Trigger

Buy a NIFTY option once the index spot crosses 24,500:

```ts
await client.conditionalTriggers.place({
  dhanClientId: process.env.DHAN_CLIENT_ID!,
  condition: {
    comparisonType: "PRICE_WITH_VALUE",
    exchangeSegment: "IDX_I",
    securityId: "13",          // NIFTY 50 index
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
      securityId: "44000",     // the option to buy when triggered
      quantity: 50,
    },
  ],
});
```

Or build the condition with a helper instead of writing it by hand:

```ts
const condition = ConditionalTriggers.buildPriceCondition({
  exchangeSegment: "IDX_I",
  securityId: "13",            // NIFTY 50 index
  triggerAbove: 24500,         // or triggerBelow: 23500
});
```

## Place an Indicator-Based Trigger

Three comparison types cover the technical cases:

- `TECHNICAL_WITH_VALUE` — an indicator crosses a value (RSI 14 crossing above 30)
- `TECHNICAL_WITH_INDICATOR` — one indicator crosses another (SMA 20 crossing SMA 50)
- `TECHNICAL_WITH_CLOSE` — an indicator crosses the instrument's close

```ts
// Buy when RELIANCE's 15-minute RSI crosses back above 30 (oversold recovery)
await client.conditionalTriggers.place({
  dhanClientId: process.env.DHAN_CLIENT_ID!,
  condition: {
    comparisonType: "TECHNICAL_WITH_VALUE",
    exchangeSegment: "NSE_EQ",
    securityId: "2885",          // RELIANCE
    indicatorName: "RSI_14",
    timeFrame: "FIFTEEN_MIN",
    operator: "CROSSING_UP",
    comparingValue: 30,
    frequency: "ONCE",
  },
  orders: [
    {
      transactionType: "BUY",
      exchangeSegment: "NSE_EQ",
      productType: "CNC",
      orderType: "MARKET",
      validity: "DAY",
      securityId: "2885",
      quantity: 10,
    },
  ],
});
```

The helper form:

```ts
const condition = ConditionalTriggers.buildTechnicalCondition({
  exchangeSegment: "NSE_EQ",
  securityId: "2885",          // RELIANCE
  indicatorName: "SMA_20",
  timeFrame: "FIFTEEN_MIN",
  crossingAbove: 2500,         // or crossingBelow: 2400
});
```

## Manage Triggers

```ts
// List all conditional triggers
const triggers = await client.conditionalTriggers.list();

// Fetch one by ID
const trigger = await client.conditionalTriggers.getById(alertId);

// Modify — a condition always needs its securityId, even when only the
// threshold changes
await client.conditionalTriggers.modify(alertId, {
  condition: {
    comparisonType: "PRICE_WITH_VALUE",
    exchangeSegment: "IDX_I",
    securityId: "13",
    operator: "GREATER_THAN",
    comparingValue: 24600,
    frequency: "ONCE",
  },
});

// Cancel
await client.conditionalTriggers.cancel(alertId);
```

## Condition Fields

| Field | Values |
| --- | --- |
| `comparisonType` | `PRICE_WITH_VALUE`, `TECHNICAL_WITH_VALUE`, `TECHNICAL_WITH_INDICATOR`, `TECHNICAL_WITH_CLOSE` |
| `exchangeSegment` / `securityId` | The instrument being **watched** |
| `indicatorName` | e.g. `SMA_20`, `SMA_50`, `EMA_20`, `RSI_14`, `STOCHRSI_14`, `MACD_12`, `BB_UPPER`, `ATR_14` |
| `timeFrame` | `ONE_MIN`, `FIVE_MIN`, `FIFTEEN_MIN`, `DAY` |
| `operator` | `CROSSING_UP`, `CROSSING_DOWN`, `CROSSING_ANY_SIDE`, `GREATER_THAN`, `GREATER_THAN_EQUAL`, `LESS_THAN`, `LESS_THAN_EQUAL`, `EQUAL`, `NOT_EQUAL` |
| `comparingValue` | The threshold the watched series crosses |
| `frequency` | `ONCE` — how often the trigger can fire |
| `expDate` | Optional expiry date for the alert |

Each entry in `orders` is a standard order shape (`transactionType`,
`exchangeSegment`, `productType`, `orderType`, `validity`, `securityId`,
`quantity`, with `price`/`triggerPrice`/`discQuantity` as strings for LIMIT
orders) — fired at the broker when the condition resolves.

DhanHQ reference: [Conditional and Multi Order](https://docs.dhanhq.co/api/v2/conditional-triggers).
