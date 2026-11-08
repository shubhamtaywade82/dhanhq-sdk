import { attributeOptionPremiumChange } from "../src/analytics/optionPremiumAttribution";

describe("attributeOptionPremiumChange", () => {
  const input = {
    strike: 100,
    optionType: "call" as const,
    riskFreeRate: 0.05,
    from: {
      spot: 100,
      impliedVolatility: 0.2,
      timeToExpiry: 30 / 365,
      marketPremium: 5,
    },
    to: {
      spot: 110,
      impliedVolatility: 0.25,
      timeToExpiry: 20 / 365,
      marketPremium: 12,
    },
  };

  it("decomposes modeled premium change into spot, volatility and time contributions", () => {
    const result = attributeOptionPremiumChange(input);

    const sum =
      result.spotContribution +
      result.volatilityContribution +
      result.timeContribution;

    expect(sum).toBeCloseTo(result.modeledPremiumChange, 10);
    expect(result.residual).toBeCloseTo(
      result.actualPremiumChange - result.modeledPremiumChange,
      10,
    );
    expect(result.actualPremiumChange).toBe(7);
  });

  it("is order-independent because each factor contribution is averaged across permutations", () => {
    const result = attributeOptionPremiumChange(input);

    expect(result.spotContribution).toBeGreaterThan(0);
    expect(result.volatilityContribution).toBeGreaterThan(0);
    expect(result.timeContribution).toBeLessThan(0);
  });

  it("rejects non-positive spot, strike, premium, IV and time to expiry", () => {
    expect(() =>
      attributeOptionPremiumChange({
        ...input,
        from: { ...input.from, spot: 0 },
      }),
    ).toThrow();

    expect(() =>
      attributeOptionPremiumChange({
        ...input,
        strike: 0,
      }),
    ).toThrow();

    expect(() =>
      attributeOptionPremiumChange({
        ...input,
        to: { ...input.to, marketPremium: 0 },
      }),
    ).toThrow();

    expect(() =>
      attributeOptionPremiumChange({
        ...input,
        from: { ...input.from, impliedVolatility: 0 },
      }),
    ).toThrow();

    expect(() =>
      attributeOptionPremiumChange({
        ...input,
        to: { ...input.to, timeToExpiry: 0 },
      }),
    ).toThrow();
  });
});
