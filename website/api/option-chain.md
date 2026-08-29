---
title: DhanHQ Option Chain API — TypeScript & Node.js
description: Fetch option chains, expiry lists, compute Greeks (delta, gamma, theta, vega), implied volatility, max pain, and PCR using the DhanHQ TypeScript SDK.
---

# Option Chain

Fetch option chains, expiry lists, and compute options analytics including Greeks, implied volatility, max pain, and put-call ratio.

The option chain covers **live** contracts only. For historical data on
**expired** contracts (backtesting), see
[Expired Options Data](/api/expired-options).

## Option Chain

### Expiry List

```ts
const expiries = await client.optionChain.expiryList({
  underlyingScrip: 13,
  underlyingSeg: "IDX_I",
});
```

### Raw Option Chain

```ts
const chain = await client.optionChain.fetch({
  underlyingScrip: 13,
  underlyingSeg: "IDX_I",
  expiry: "2026-08-04",
});
```

### Normalized Option Chain

Returns a flattened, sorted array of strikes with call/put legs:

```ts
const chain = await client.optionChain.fetchNormalized({
  underlyingScrip: 13,
  underlyingSeg: "IDX_I",
  expiry: "2026-08-04",
});

// Access individual strikes
chain.strikes.forEach((strike) => {
  console.log(strike.strike, strike.call?.last_price, strike.put?.last_price);
});

// Find ATM strike
const atm = chain.strikes.find(
  (s) => s.strike >= (chain.lastPrice ?? 0)
);
```

## Option Greeks

Compute Black-Scholes Greeks for any option:

```ts
import { greeks } from "@nemesis-oss/dhanhq-sdk";

const result = greeks({
  spot: 24_000,
  strike: 24_200,
  timeToExpiry: 10 / 365,  // 10 days
  riskFreeRate: 0.065,     // 6.5%
  volatility: 0.15,        // 15% IV
  optionType: "call",      // "call" | "put"
});

console.log(result.delta);  // option delta
console.log(result.gamma);  // option gamma
console.log(result.theta);  // option theta (daily)
console.log(result.vega);   // option vega
```

## Implied Volatility

Back-solve volatility from market price:

```ts
import { impliedVolatility } from "@nemesis-oss/dhanhq-sdk";

const iv = impliedVolatility({
  spot: 24_000,
  strike: 24_200,
  timeToExpiry: 10 / 365,
  riskFreeRate: 0.065,
  marketPrice: 150,
  optionType: "call",
});
```

## Max Pain

`maxPain()` returns just the strike; `detailedMaxPain()` also returns the
full pain curve, for plotting:

```ts
import { detailedMaxPain, maxPain, openInterestFromChain } from "@nemesis-oss/dhanhq-sdk";

const oi = openInterestFromChain(chain);
console.log("Max pain strike:", maxPain(oi));

const detail = detailedMaxPain(oi);
console.log("Total pain at max pain:", detail?.totalPain);
```

## Put-Call Ratio

By open interest, and separately by traded volume:

```ts
import { openInterestFromChain, putCallRatio, volumePutCallRatio } from "@nemesis-oss/dhanhq-sdk";

console.log("PCR (OI):", putCallRatio(openInterestFromChain(chain)));
console.log("PCR (Volume):", volumePutCallRatio(chain));
```

## Open Interest Concentration

The strikes carrying the most OI on each side — support (put OI) and
resistance (call OI):

```ts
import { highestCallOi, highestPutOi } from "@nemesis-oss/dhanhq-sdk";

console.log("Resistance (highest call OI):", highestCallOi(chain, 3));
console.log("Support (highest put OI):", highestPutOi(chain, 3));
```
