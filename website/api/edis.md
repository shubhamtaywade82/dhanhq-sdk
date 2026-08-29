---
title: DhanHQ eDIS API — TypeScript & Node.js
description: Complete the CDSL eDIS flow — generate T-PIN, generate the authorization form, and check per-ISIN sell quantity status — using the DhanHQ TypeScript SDK.
---

# eDIS (Electronic Delivery Instruction Slip)

To sell holdings that are not already pledged or covered by a power of
attorney, CDSL requires an *Electronic Delivery Instruction Slip*: you generate
a T-PIN, authorize the specific stock and quantity on the CDSL portal, and only
then does the broker release the sell. The SDK wraps the three endpoints behind
`client.edis`.

## 1. Generate a T-PIN

The T-PIN is the CDSL portal credential. Requesting one triggers an OTP to your
registered mobile and email:

```ts
await client.edis.requestTpin();
```

## 2. Generate the eDIS Form

The form request returns an HTML page you must open (in the user's browser) for
CDSL authorization — enter the T-PIN plus the OTP there. This example authorizes
selling 10 shares of Reliance:

```ts
const form = await client.edis.form({
  isin: "INE002A01018", // Reliance — the ISIN, not the security ID
  qty: 10,
  exchange: "NSE",
  segment: "EQ",
  bulk: false,
});

console.log(form.edisFormHtml); // HTML form to render/redirect to
```

Authorizing several holdings at once:

```ts
const bulkForm = await client.edis.bulkForm({
  isin: ["INE002A01018", "INE467B01029"], // Reliance, TCS
  exchange: "NSE",
  segment: "EQ",
});
```

## 3. Check Authorized Quantity

Before firing the sell order, confirm how much of the ISIN is actually cleared
for delivery:

```ts
const status = await client.edis.getQuantityStatus("INE002A01018");

console.log(status.totalQty);  // total quantity marked via eDIS (string)
console.log(status.aprvdQty);  // approved quantity (string)
console.log(status.status, status.remarks);
```

## Full Sell Flow

```ts
// 1. Ask CDSL for a T-PIN (if the user doesn't have one)
await client.edis.requestTpin();

// 2. Generate the authorization form for the holding being sold
const form = await client.edis.form({
  isin: "INE002A01018",
  qty: 10,
  exchange: "NSE",
  segment: "EQ",
  bulk: false,
});
// → open form.edisFormHtml so the user can authorize with T-PIN + OTP

// 3. Verify the quantity is now marked
const status = await client.edis.getQuantityStatus("INE002A01018");

// 4. Only now place the sell
if (Number(status.aprvdQty ?? 0) >= 10) {
  await client.orders.place({
    dhanClientId: process.env.DHAN_CLIENT_ID!,
    transactionType: "SELL",
    exchangeSegment: "NSE_EQ",
    productType: "CNC",
    orderType: "MARKET",
    validity: "DAY",
    securityId: "2885",
    quantity: 10,
    correlationId: "edis-sell-001",
  });
}
```

::: warning
eDIS authorization is per-ISIN and per-quantity — a sell order for more than
the approved quantity is rejected at the exchange. Always re-check
`getQuantityStatus` after authorizing and before placing the sell. Note the
quantities arrive as **strings**; convert before comparing.
:::

DhanHQ reference: [EDIS](https://docs.dhanhq.co/api/v2/edis) — Generate T-PIN,
Generate eDIS Form, EDIS Status Inquiry.
