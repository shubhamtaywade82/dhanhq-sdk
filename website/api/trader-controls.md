---
title: DhanHQ Trader's Control API — TypeScript & Node.js
description: Account-level safety rails — kill switch and P&L-based auto-exit — via the DhanHQ Trader's Control API, using the DhanHQ TypeScript SDK.
---

# Trader's Control

The [pre-trade risk pipeline](/risk/) stops a bad order before it is sent.
Trader's Control stops the damage **after** it accumulates — and it keeps
working when your process does not, because both controls live at the broker.

- **Kill switch** — blocks all trading for the rest of the day
- **P&L auto-exit** — squares off open positions when day P&L crosses your
  profit or loss threshold, optionally arming the kill switch on exit

Both hang off `client.traderControls`.

## P&L Auto-Exit

Square off everything at +₹5,000 or −₹2,500, and block re-entry once the book
is flattened:

```ts
await client.traderControls.setPnlExit({
  profitValue: 5_000,       // exit when day P&L reaches +5,000
  lossValue: 2_500,         // exit when day P&L drops to -2,500
  enableKillSwitch: true,   // arm the kill switch after the exit
  productType: ["INTRADAY"],  // "INTRADAY" | "DELIVERY"
});

// Read the current configuration
const config = await client.traderControls.getPnlExit();
console.log(config.profit, config.loss, config.enableKillSwitch, config.productType);

// Disarm it
await client.traderControls.stopPnlExit();
```

## Kill Switch

The emergency stop — blocks order placement for the rest of the trading day:

```ts
// Activate
await client.traderControls.setKillSwitch("ACTIVATE");

// Check state
const status = await client.traderControls.getKillSwitchStatus();
console.log(status.killSwitchStatus);

// Deactivate (resets for the next trading day)
await client.traderControls.setKillSwitch("DEACTIVATE");
```

## Placement in a Trading Loop

A common pattern: arm the P&L exit at strategy start, and treat the kill
switch as the manual circuit breaker you can flip from anywhere — a separate
process, a dashboard, even a phone call to a teammate with API access:

```ts
// strategy startup
await client.traderControls.setPnlExit({
  profitValue: 5_000,
  lossValue: 2_500,
  enableKillSwitch: true,
  productType: ["INTRADAY"],
});

// ... strategy runs; if P&L exits, the kill switch blocks re-entry ...

// before shutdown, disarm so tomorrow's session starts clean
await client.traderControls.setKillSwitch("DEACTIVATE");
await client.traderControls.stopPnlExit();
```

::: tip
Through the agent/MCP layer these sit on the `risk:write` scope, deliberately
separate from `orders:write` — an agent allowed to trade cannot disarm the
account's own safety rails as a side effect. See
[Agent Tools](/ai/mcp-server#agent-tools).
:::

Runnable example: [`examples/risk-controls.ts`](https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/examples/risk-controls.ts)
(`APPLY=true` to arm).

DhanHQ reference: [Trader's Control](https://docs.dhanhq.co/api/v2/traders-control).
