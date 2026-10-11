import {
  atrStop,
  fixedRiskSize,
  kellySize,
  percentageStop,
  Pipeline,
  riskTypeFor,
  RiskViolationError,
  supportStop,
  takeProfit,
  TrailManager,
  volatilitySize,
  type Instrument,
  type RiskDataProvider,
} from "../src";

/** A tradable, unrestricted NSE equity — the baseline every check passes on. */
function tradableInstrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    securityId: "2885",
    symbolName: "RELIANCE",
    exchangeSegment: "NSE_EQ",
    instrument: "EQUITY",
    instrumentType: "ES",
    buySellIndicator: "A",
    asmGsmFlag: "N",
    bracketFlag: "Y",
    coverFlag: "Y",
    ...overrides,
  };
}

function provider(
  positions: Array<Record<string, unknown>> = [],
  funds: Record<string, unknown> = { availabelBalance: 1_000_000 },
): RiskDataProvider {
  return {
    positions: async () => positions,
    funds: async () => funds,
  };
}

/** Wednesday 2026-01-21, 11:00 IST — inside market hours. */
const duringMarketHours = new Date("2026-01-21T05:30:00Z");

const validOrder = {
  transactionType: "BUY" as const,
  exchangeSegment: "NSE_EQ" as const,
  productType: "CNC" as const,
  orderType: "LIMIT" as const,
  securityId: "2885",
  quantity: 5,
  price: 1000,
};

describe("risk pipeline", () => {
  it("passes a well-formed order inside market hours", async () => {
    const pipeline = new Pipeline({ provider: provider() });

    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument(),
        now: duringMarketHours,
      }),
    ).resolves.toBe(true);
  });

  it("blocks instruments where trading is disabled", async () => {
    const pipeline = new Pipeline({ provider: provider() });

    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument({ buySellIndicator: "N" }),
        now: duringMarketHours,
      }),
    ).rejects.toThrow(RiskViolationError);
  });

  it("blocks ASM/GSM restricted instruments", async () => {
    const pipeline = new Pipeline({ provider: provider() });

    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument({
          asmGsmFlag: "Y",
          asmGsmCategory: "ASM Stage 1",
        }),
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/ASM\/GSM/);
  });

  it("rejects bracket orders on instruments that do not support them", async () => {
    const pipeline = new Pipeline({ provider: provider() });

    await expect(
      pipeline.run({
        args: { ...validOrder, productType: "BO" },
        instrument: tradableInstrument({ bracketFlag: "N" }),
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/Bracket orders not supported/);
  });

  it("rejects order types outside the allowlist", async () => {
    const pipeline = new Pipeline({ provider: provider() });

    await expect(
      pipeline.run({
        args: { ...validOrder, orderType: "STOP_LOSS", triggerPrice: 990 },
        instrument: tradableInstrument(),
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/not allowed/);
  });

  it("enforces the quantity ceiling", async () => {
    const pipeline = new Pipeline({ provider: provider() });

    await expect(
      pipeline.run({
        args: { ...validOrder, quantity: 500, price: 1 },
        instrument: tradableInstrument(),
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/exceeds limit/);
  });

  it("enforces the notional ceiling only when a price is present", async () => {
    const pipeline = new Pipeline({
      provider: provider(),
      limits: { maxNotional: 1000 },
    });

    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument(),
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/Notional/);

    // A MARKET order has no price, so the notional check has nothing to test.
    await expect(
      pipeline.run({
        args: { ...validOrder, orderType: "MARKET", price: undefined },
        instrument: tradableInstrument(),
        now: duringMarketHours,
      }),
    ).resolves.toBe(true);
  });

  it("blocks orders outside market hours and on weekends", async () => {
    const pipeline = new Pipeline({ provider: provider() });

    // 2026-01-21 03:00 IST — before the open.
    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument(),
        now: new Date("2026-01-20T21:30:00Z"),
      }),
    ).rejects.toThrow(/Market is closed/);

    // Saturday 2026-01-24, 11:00 IST.
    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument(),
        now: new Date("2026-01-24T05:30:00Z"),
      }),
    ).rejects.toThrow(/Market is closed/);
  });

  it("caps concurrent open positions", async () => {
    const positions = Array.from({ length: 3 }, () => ({ netQty: 10 }));
    const pipeline = new Pipeline({
      provider: provider(positions),
      limits: { maxOpenPositions: 3 },
    });

    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument(),
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/open positions exceeded/);
  });

  it("caps single-symbol concentration", async () => {
    const pipeline = new Pipeline({
      provider: provider(
        [{ securityId: "2885", netQty: 100, costPrice: 1000 }],
        { availabelBalance: 200_000 },
      ),
      limits: { maxConcentrationPct: 25 },
    });

    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument(),
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/Concentration/);
  });

  it("stops trading once the daily loss limit is breached", async () => {
    const pipeline = new Pipeline({
      provider: provider([{ netQty: 10, unrealizedProfit: -60_000 }]),
      limits: { dailyMaxLoss: 50_000 },
    });

    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument(),
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/Daily loss limit/);
  });

  it("requires index underlying, stop loss and target on options orders", async () => {
    const pipeline = new Pipeline({ provider: provider() });
    const optionInstrument = tradableInstrument({
      instrumentType: "INDEX",
      instrument: "OPTIDX",
    });

    await expect(
      pipeline.run({
        args: validOrder,
        instrument: optionInstrument,
        type: "options",
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/Stop loss required/);

    await expect(
      pipeline.run({
        args: { ...validOrder, stopLoss: 100 },
        instrument: optionInstrument,
        type: "options",
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/Target required/);

    await expect(
      pipeline.run({
        args: { ...validOrder, stopLoss: 200, target: 100 },
        instrument: optionInstrument,
        type: "options",
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/Invalid risk-reward/);

    await expect(
      pipeline.run({
        args: { ...validOrder, stopLoss: 100, target: 200 },
        instrument: optionInstrument,
        type: "options",
        now: duringMarketHours,
      }),
    ).resolves.toBe(true);
  });

  it("skips account checks when no data provider is configured", async () => {
    const pipeline = new Pipeline();

    await expect(
      pipeline.run({
        args: validOrder,
        instrument: tradableInstrument(),
        now: duringMarketHours,
      }),
    ).resolves.toBe(true);
  });

  it("collects every violation in report mode instead of throwing", async () => {
    const pipeline = new Pipeline({
      provider: provider([{ netQty: 1, unrealizedProfit: -100_000 }]),
    });

    const report = await pipeline.report({
      args: { ...validOrder, quantity: 5000, orderType: "STOP_LOSS" },
      instrument: tradableInstrument({ buySellIndicator: "N" }),
      now: duringMarketHours,
    });

    expect(report.passed).toBe(false);
    expect(report.violations.map((v) => v.check)).toEqual(
      expect.arrayContaining([
        "trading_permission",
        "order_type",
        "quantity",
        "max_loss",
      ]),
    );
  });

  it("routes option instruments to the options check set", () => {
    // Real scrip-master rows: INSTRUMENT carries the contract kind; INSTRUMENT_TYPE is "OP".
    expect(riskTypeFor(tradableInstrument({ instrument: "OPTIDX", instrumentType: "OP" }))).toBe(
      "options",
    );
    expect(riskTypeFor(tradableInstrument({ instrument: "OPTSTK", instrumentType: "OP" }))).toBe(
      "options",
    );
    expect(riskTypeFor(tradableInstrument())).toBe("equity");
    expect(riskTypeFor(undefined)).toBe("equity");
  });
});

describe("position sizing", () => {
  it("sizes to the configured risk per trade", () => {
    // 2% of 100000 = 2000 risk, 50 per share → 40 shares.
    expect(
      fixedRiskSize({
        accountBalance: 100_000,
        riskPercent: 2,
        entryPrice: 2500,
        stopLossPrice: 2450,
      }),
    ).toBe(40);
  });

  it("rounds down to whole lots", () => {
    expect(
      fixedRiskSize({
        accountBalance: 100_000,
        riskPercent: 2,
        entryPrice: 2500,
        stopLossPrice: 2450,
        lotSize: 25,
      }),
    ).toBe(25);
  });

  it("returns zero for degenerate inputs", () => {
    expect(
      fixedRiskSize({
        accountBalance: 0,
        riskPercent: 2,
        entryPrice: 100,
        stopLossPrice: 90,
      }),
    ).toBe(0);
    expect(
      fixedRiskSize({
        accountBalance: 100_000,
        riskPercent: 2,
        entryPrice: 100,
        stopLossPrice: 100,
      }),
    ).toBe(0);
  });

  it("declines to size a negative-edge Kelly bet", () => {
    expect(
      kellySize({
        winRate: 0.3,
        avgWin: 100,
        avgLoss: 100,
        accountBalance: 100_000,
        entryPrice: 100,
      }),
    ).toBe(0);
  });

  it("sizes a positive-edge Kelly bet at half Kelly", () => {
    // b=2, p=0.6 → f = (2*0.6 - 0.4)/2 = 0.4; half-Kelly → 0.2 of 100000 / 100.
    expect(
      kellySize({
        winRate: 0.6,
        avgWin: 200,
        avgLoss: 100,
        accountBalance: 100_000,
        entryPrice: 100,
      }),
    ).toBe(200);
  });

  it("derives the stop from ATR when sizing on volatility", () => {
    expect(
      volatilitySize({
        accountBalance: 100_000,
        riskPercent: 2,
        entryPrice: 2500,
        atr: 25,
        atrMultiplier: 2,
      }),
    ).toBe(40);
  });

  it("places percentage, ATR and support stops", () => {
    expect(percentageStop(1000, 2)).toBe(980);
    expect(atrStop(1000, 20, 2)).toBe(960);
    expect(supportStop(1000, [950, 900, 1050], 0)).toBe(950);
    expect(supportStop(1000, [1050], 0)).toBe(0);
  });

  it("targets a multiple of the risk taken", () => {
    expect(takeProfit(1000, 980, 2)).toBe(1040);
  });
});

describe("trailing stop", () => {
  it("ratchets up with price and never loosens", () => {
    const trail = new TrailManager(100, 90, 5, 2);

    expect(trail.update(105).stop).toBe(95);
    expect(trail.update(110).stop).toBe(100);
    // A pullback must not move the stop back down.
    expect(trail.update(102).stop).toBe(100);
    expect(trail.highest).toBe(110);
  });

  it("triggers once price falls through the stop", () => {
    const trail = new TrailManager(100, 90, 5, 2);
    trail.update(110);

    expect(trail.update(99).triggered).toBe(true);
    expect(trail.isTriggered(99)).toBe(true);
  });

  it("reports profit in absolute and percentage terms", () => {
    const trail = new TrailManager(100, 90, 5);

    expect(trail.profit(110)).toBe(10);
    expect(trail.profitPercent(110)).toBe(10);
  });

  describe("risk-reducing orders", () => {
    const optionContract = tradableInstrument({
      securityId: "52175",
      exchangeSegment: "NSE_FNO",
      instrument: "OPTIDX",
      instrumentType: "OP",
    });
    const heldLong = {
      securityId: "52175",
      exchangeSegment: "NSE_FNO",
      productType: "INTRADAY",
      netQty: 75,
      costPrice: 120,
      unrealizedProfit: -60_000,
      realizedProfit: 0,
    };
    const stopOut = {
      transactionType: "SELL" as const,
      exchangeSegment: "NSE_FNO" as const,
      productType: "INTRADAY" as const,
      orderType: "MARKET" as const,
      securityId: "52175",
      quantity: 75,
    };

    it("lets a stop-out through the loss, size, position-count and options entry rules", async () => {
      const crowded = [heldLong, ...Array.from({ length: 25 }, (_, i) => ({ securityId: `x${i}`, netQty: 1 }))];
      const pipeline = new Pipeline({ provider: provider(crowded) });

      await expect(
        pipeline.run({ args: stopOut, instrument: optionContract, type: "options", now: duringMarketHours }),
      ).resolves.toBe(true);
    });

    it("still blocks a new entry on the same account", async () => {
      const pipeline = new Pipeline({ provider: provider([heldLong]) });

      await expect(
        pipeline.run({
          args: { ...stopOut, transactionType: "BUY" as const, securityId: "99999", quantity: 1 },
          instrument: tradableInstrument(),
          now: duringMarketHours,
        }),
      ).rejects.toThrow(/Daily loss limit/);
    });

    it("treats an order larger than the position as new exposure", async () => {
      const pipeline = new Pipeline({ provider: provider([{ ...heldLong, unrealizedProfit: 0 }]) });

      await expect(
        pipeline.run({ args: { ...stopOut, quantity: 150 }, instrument: optionContract, now: duringMarketHours }),
      ).rejects.toThrow(/exceeds limit/);
    });

    it("fetches positions once per run", async () => {
      const positions = jest.fn(async () => [heldLong]);
      const pipeline = new Pipeline({ provider: { positions, funds: async () => ({ availabelBalance: 1e7 }) } });

      await pipeline.run({ args: stopOut, instrument: optionContract, now: duringMarketHours });

      expect(positions).toHaveBeenCalledTimes(1);
    });
  });

  it("counts realized losses toward the daily limit", async () => {
    const pipeline = new Pipeline({
      provider: provider([{ securityId: "1", netQty: 0, realizedProfit: -40_000, unrealizedProfit: -20_000 }]),
    });

    await expect(
      pipeline.run({ args: validOrder, instrument: tradableInstrument(), now: duringMarketHours }),
    ).rejects.toThrow(/Daily loss limit/);
  });

  it("allows index options and refuses stock options when optionsIndexOnly is on", async () => {
    const pipeline = new Pipeline({ provider: provider() });
    const withStops = { ...validOrder, stopLoss: 90, target: 150 };

    await expect(
      pipeline.run({
        args: withStops,
        instrument: tradableInstrument({ instrument: "OPTIDX", instrumentType: "OP" }),
        type: "options",
        now: duringMarketHours,
      }),
    ).resolves.toBe(true);
    await expect(
      pipeline.run({
        args: withStops,
        instrument: tradableInstrument({ instrument: "OPTSTK", instrumentType: "OP" }),
        type: "options",
        now: duringMarketHours,
      }),
    ).rejects.toThrow(/index underlyings/);
  });
});
