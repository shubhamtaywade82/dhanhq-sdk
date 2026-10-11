---
title: DhanHQ Risk Management — TypeScript & Node.js
description: Pre-trade risk pipeline, position sizing, trailing stops, and account-level risk controls for algorithmic trading with the DhanHQ TypeScript SDK.
---

# Risk Management

Multi-layer risk management: pre-trade checks, position monitoring, and account-level controls.

## Pre-Trade Pipeline

Validates every order before it reaches the exchange:

```ts
import { Pipeline, riskProviderFor } from "@nemesis-oss/dhanhq-sdk";

const pipeline = new Pipeline({
  provider: riskProviderFor(client),
  limits: { maxQuantity: 50, dailyMaxLoss: 25_000 },
});

// Throws RiskViolationError on first failure
await pipeline.run({ args: order, instrument });

// Collect all violations for preview
const { passed, violations } = await pipeline.report({ args: order, instrument });
```

Checks cover:
- Trading permission (exchange open/close)
- ASM/GSM restriction status
- Product support for the instrument
- Order type validity
- Quantity and notional limits
- Market hours (NSE/BSE)
- Position count limits
- Single-symbol concentration
- Daily loss threshold
- Options-specific rules (lot size, strike validity)

These checks are NSE/BSE-specific and do not apply to Global Stocks.

### Exits are never blocked

An order that **reduces** an open position — a SELL against a long, a BUY
against a short, up to the open quantity in the same segment and product — is
recognised as risk-reducing. The entry-only checks (quantity, position count,
concentration, daily loss, ASM/GSM, options rules) are skipped for it, so a
stop-loss or square-off still goes through when limits are already breached.
Permission, order-type, product and market-hours checks still apply.

### What the limits count

- **Daily loss** uses realized + unrealized P&L, so booked losses count.
- **Concentration** includes the new order's own notional (price, or trigger
  price for stop orders).
- **Options** are identified by the scrip master's `INSTRUMENT` column
  (`OPTIDX` / `OPTSTK`); `INSTRUMENT_TYPE` is `OP` for both, so index-only
  option rules key off `OPTIDX`.

## Position Monitor

Real-time exit signals driven by WebSocket ticks:

```ts
import { PositionMonitor } from "@nemesis-oss/dhanhq-sdk";

const monitor = new PositionMonitor();

client.ws.market.on("tick", (tick) => monitor.onTick(tick));

monitor.track({
  securityId: "2885",
  exchangeSegment: "NSE_EQ",
  quantity: 100,
  entryPrice: 1400,
  stopLoss: 1386,
  target: 1428,
  trail: { atr: 7, multiplier: 2 },
});

monitor.on("exit", (signal) => {
  console.log(signal.reason, signal.pnl);
  // reason: "stop_loss" | "target" | "trailing_stop"
});
```

`PositionMonitor` only decides — it never places an order.

## Account-Level Controls

```ts
// Auto-square-off at profit/loss thresholds
await client.traderControls.setPnlExit({
  profitValue: 5_000,
  lossValue: 2_500,
  enableKillSwitch: true,
});

// Emergency block
await client.traderControls.setKillSwitch("ACTIVATE");
```

## Position Sizing

Pure functions — no API access needed for planning:

```ts
import { fixedRiskSize, volatilitySize, kellySize } from "@nemesis-oss/dhanhq-sdk";

// Fixed-percent risk: quantity such that a stop-out costs 2% of the account
const size = fixedRiskSize({
  accountBalance: 1_000_000,
  riskPercent: 2,
  entryPrice: 100,
  stopLossPrice: 95,
});

// Same idea, but the stop distance comes from ATR
const atrSize = volatilitySize({
  accountBalance: 1_000_000,
  riskPercent: 2,
  entryPrice: 100,
  atr: 7,
  atrMultiplier: 2,
});

// Half-Kelly, scaled by historical win rate and average win/loss
const kelly = kellySize({
  winRate: 0.55,
  avgWin: 8,
  avgLoss: 5,
  accountBalance: 1_000_000,
  entryPrice: 100,
});
```

## Trailing Stops

`TrailManager` ratchets a stop up with the high-water mark and never moves it
down:

```ts
import { TrailManager, atrStop, percentageStop } from "@nemesis-oss/dhanhq-sdk";

// Initial stop placement
const initialStop = atrStop(100, 7, 2);        // ATR-based
const percentStop = percentageStop(100, 2);    // fixed 2% below entry

// Then feed live prices in as they arrive
const trail = new TrailManager(100, initialStop, 7, 2);
const update = trail.update(112);
console.log(update.stop, update.highest, update.triggered);
```
