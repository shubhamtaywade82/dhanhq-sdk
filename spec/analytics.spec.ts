import {
  detailedMaxPain,
  greeks,
  highestCallOi,
  highestPutOi,
  impliedVolatility,
  maxPain,
  normalCdf,
  normalizeOptionChain,
  openInterestFromChain,
  price,
  putCallRatio,
  volumePutCallRatio,
  yearsToExpiry,
  type StrikeOpenInterest,
} from "../src";

describe("black-scholes", () => {
  const base = {
    spot: 100,
    strike: 100,
    timeToExpiry: 1,
    riskFreeRate: 0.05,
    volatility: 0.2,
  };

  it("approximates the standard normal CDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("prices an ATM call against the textbook value", () => {
    // Standard reference case: S=K=100, r=5%, sigma=20%, T=1 → ~10.45
    expect(price({ ...base, optionType: "call" })).toBeCloseTo(10.45, 1);
  });

  it("prices an ATM put against the textbook value", () => {
    expect(price({ ...base, optionType: "put" })).toBeCloseTo(5.57, 1);
  });

  it("satisfies put-call parity", () => {
    const call = price({ ...base, optionType: "call" });
    const put = price({ ...base, optionType: "put" });
    const parity =
      base.spot - base.strike * Math.exp(-base.riskFreeRate * base.timeToExpiry);

    expect(call - put).toBeCloseTo(parity, 2);
  });

  it("returns zero at or past expiry", () => {
    expect(price({ ...base, timeToExpiry: 0, optionType: "call" })).toBe(0);
    expect(greeks({ ...base, timeToExpiry: 0, optionType: "put" })).toEqual({
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    });
  });

  it("puts ATM call delta near 0.5 and put delta near -0.5", () => {
    const call = greeks({ ...base, optionType: "call" });
    const put = greeks({ ...base, optionType: "put" });

    expect(call.delta).toBeGreaterThan(0.5);
    expect(call.delta).toBeLessThan(0.8);
    expect(put.delta).toBeLessThan(0);
    // Delta of a call minus delta of a put is exactly 1.
    expect(call.delta - put.delta).toBeCloseTo(1, 6);
  });

  it("gives calls and puts the same gamma and vega", () => {
    const call = greeks({ ...base, optionType: "call" });
    const put = greeks({ ...base, optionType: "put" });

    expect(call.gamma).toBeCloseTo(put.gamma, 8);
    expect(call.vega).toBeCloseTo(put.vega, 8);
  });

  it("decays long options over time", () => {
    expect(greeks({ ...base, optionType: "call" }).theta).toBeLessThan(0);
  });

  it("recovers the volatility used to price an option", () => {
    const marketPrice = price({ ...base, optionType: "call" });

    const iv = impliedVolatility({
      marketPrice,
      spot: base.spot,
      strike: base.strike,
      timeToExpiry: base.timeToExpiry,
      riskFreeRate: base.riskFreeRate,
      optionType: "call",
    });

    expect(iv).toBeCloseTo(0.2, 3);
  });

  it("returns zero implied volatility for a worthless or expired option", () => {
    expect(
      impliedVolatility({
        marketPrice: 0,
        spot: 100,
        strike: 100,
        timeToExpiry: 1,
        riskFreeRate: 0.05,
        optionType: "call",
      }),
    ).toBe(0);
  });

  it("floors years-to-expiry at zero for past dates", () => {
    const now = new Date("2026-01-01T00:00:00Z");

    expect(yearsToExpiry("2025-01-01T00:00:00Z", now)).toBe(0);
    expect(yearsToExpiry("2027-01-01T00:00:00Z", now)).toBeCloseTo(1, 2);
  });
});

describe("max pain", () => {
  const data: StrikeOpenInterest[] = [
    { strike: 24000, callOi: 1000, putOi: 5000 },
    { strike: 24100, callOi: 2000, putOi: 3000 },
    { strike: 24200, callOi: 5000, putOi: 1000 },
  ];

  it("finds the strike where writers lose least", () => {
    expect(maxPain(data)).toBe(24100);
  });

  it("returns the full pain curve alongside the minimum", () => {
    const detail = detailedMaxPain(data);

    expect(detail?.maxPainStrike).toBe(24100);
    expect(detail?.painDistribution).toHaveLength(3);
    expect(detail?.totalPain).toBeGreaterThanOrEqual(0);
  });

  it("returns undefined for an empty chain", () => {
    expect(maxPain([])).toBeUndefined();
    expect(detailedMaxPain([])).toBeUndefined();
  });

  it("computes the put-call ratio, guarding against zero call OI", () => {
    expect(putCallRatio(data)).toBeCloseTo(9000 / 8000, 6);
    expect(putCallRatio([{ strike: 1, callOi: 0, putOi: 100 }])).toBe(0);
  });
});

describe("option chain normalization", () => {
  const raw = {
    data: {
      last_price: 24150,
      oc: {
        "24200.000000": {
          ce: { last_price: 80, oi: 5000, volume: 100 },
          pe: { last_price: 130, oi: 1000, volume: 50 },
        },
        "24000.000000": {
          ce: { last_price: 190, oi: 1000, volume: 20 },
          pe: { last_price: 45, oi: 5000, volume: 200 },
        },
        "not-a-number": { ce: { last_price: 1 } },
      },
    },
  };

  it("sorts strikes ascending and drops unparseable keys", () => {
    const chain = normalizeOptionChain(raw);

    expect(chain.lastPrice).toBe(24150);
    expect(chain.strikes.map((entry) => entry.strike)).toEqual([24000, 24200]);
  });

  it("handles a response with no chain data", () => {
    expect(normalizeOptionChain({})).toEqual({
      lastPrice: undefined,
      strikes: [],
    });
  });

  it("extracts open interest and ranks OI walls", () => {
    const chain = normalizeOptionChain(raw);

    expect(openInterestFromChain(chain)).toEqual([
      { strike: 24000, callOi: 1000, putOi: 5000 },
      { strike: 24200, callOi: 5000, putOi: 1000 },
    ]);
    expect(highestCallOi(chain, 1)).toEqual([{ strike: 24200, oi: 5000 }]);
    expect(highestPutOi(chain, 1)).toEqual([{ strike: 24000, oi: 5000 }]);
  });

  it("computes a volume-weighted put-call ratio", () => {
    expect(volumePutCallRatio(normalizeOptionChain(raw))).toBeCloseTo(
      250 / 120,
      6,
    );
  });
});

describe("option chain v2.5 response contract", () => {
  // Shape per Dhan v2.5: each leg carries `security_id` and `average_price`
  // alongside the existing greeks / IV / OI / depth fields.
  const v25 = {
    status: "success",
    data: {
      last_price: 25642.8,
      oc: {
        "25650.000000": {
          ce: {
            security_id: 42528,
            average_price: 146.99,
            greeks: { delta: 0.53, theta: -15.15, gamma: 0.00132, vega: 12.18 },
            implied_volatility: 9.79,
            last_price: 134,
            oi: 3786445,
            previous_close_price: 244.85,
            previous_oi: 402220,
            previous_volume: 31931705,
            top_ask_price: 134,
            top_ask_quantity: 1365,
            top_bid_price: 133.55,
            top_bid_quantity: 1625,
            volume: 117567970,
          },
          pe: {
            security_id: 42529,
            average_price: 120.5,
            greeks: { delta: -0.47, theta: -12.1, gamma: 0.0013, vega: 12.1 },
            implied_volatility: 10.1,
            last_price: 118,
            oi: 2100000,
            volume: 90000000,
            future_field: "kept",
          },
        },
      },
    },
  };

  it("preserves security_id and average_price through normalization", () => {
    const [entry] = normalizeOptionChain(v25).strikes;

    expect(entry?.strike).toBe(25650);
    expect(entry?.call?.security_id).toBe(42528);
    expect(entry?.call?.average_price).toBe(146.99);
    expect(entry?.put?.security_id).toBe(42529);
    expect(entry?.put?.average_price).toBe(120.5);
  });

  it("keeps the pre-v2.5 fields and any untyped extras intact", () => {
    const [entry] = normalizeOptionChain(v25).strikes;

    expect(entry?.call).toEqual(v25.data.oc["25650.000000"].ce);
    expect(entry?.put).toEqual(v25.data.oc["25650.000000"].pe);
    expect(entry?.put?.["future_field"]).toBe("kept");
  });

  it("treats legs without the v2.5 fields as valid (older payloads)", () => {
    const [entry] = normalizeOptionChain({
      data: { oc: { "100": { ce: { last_price: 1 } } } },
    }).strikes;

    expect(entry?.call?.security_id).toBeUndefined();
    expect(entry?.call?.average_price).toBeUndefined();
  });
});
