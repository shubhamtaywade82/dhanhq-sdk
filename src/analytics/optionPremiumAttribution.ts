import { price, type OptionKind } from "./blackScholes";

export interface OptionPremiumState {
  /** Underlying spot price. */
  spot: number;
  /** Annualized implied volatility as a decimal: 0.20 means 20%. */
  impliedVolatility: number;
  /** Time to expiry in years, using the same day-count convention end to end. */
  timeToExpiry: number;
  /** Observed option premium (LTP or a consistently defined executable mark). */
  marketPremium: number;
}

export interface OptionPremiumAttributionInput {
  strike: number;
  optionType: OptionKind;
  riskFreeRate: number;
  from: OptionPremiumState;
  to: OptionPremiumState;
}

export interface OptionPremiumAttribution {
  actualPremiumChange: number;
  actualReturnPct: number;
  modeledPremiumFrom: number;
  modeledPremiumTo: number;
  modeledPremiumChange: number;
  spotContribution: number;
  volatilityContribution: number;
  timeContribution: number;
  residual: number;
}

type Factor = "spot" | "impliedVolatility" | "timeToExpiry";

const FACTORS: Factor[] = ["spot", "impliedVolatility", "timeToExpiry"];

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];

  return items.flatMap((item, index) =>
    permutations(items.filter((_, current) => current !== index)).map(
      (rest) => [item, ...rest],
    ),
  );
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(name + " must be a finite number greater than zero");
  }
}

function modelPrice(
  state: OptionPremiumState,
  strike: number,
  optionType: OptionKind,
  riskFreeRate: number,
): number {
  return price({
    spot: state.spot,
    strike,
    timeToExpiry: state.timeToExpiry,
    riskFreeRate,
    volatility: state.impliedVolatility,
    optionType,
  });
}

/**
 * Decomposes a market premium change into spot, IV and time-to-expiry effects.
 *
 * Contributions use a three-factor Shapley decomposition: each factor's
 * marginal effect is averaged over all six possible factor-switching orders.
 * This handles interactions (notably gamma/vega cross-effects) without making
 * the result depend on an arbitrary order of repricing.
 *
 * The residual is observed premium change less the Black-Scholes modeled
 * change. It is not a pure "market microstructure" measure: it also contains
 * model error, volatility-skew effects, dividends, rates, stale marks and data
 * mismatch. Inputs must use synchronized timestamps and IV as a decimal.
 */
export function attributeOptionPremiumChange(
  input: OptionPremiumAttributionInput,
): OptionPremiumAttribution {
  assertPositive("strike", input.strike);
  assertPositive("from.spot", input.from.spot);
  assertPositive("to.spot", input.to.spot);
  assertPositive("from.impliedVolatility", input.from.impliedVolatility);
  assertPositive("to.impliedVolatility", input.to.impliedVolatility);
  assertPositive("from.timeToExpiry", input.from.timeToExpiry);
  assertPositive("to.timeToExpiry", input.to.timeToExpiry);
  assertPositive("from.marketPremium", input.from.marketPremium);
  assertPositive("to.marketPremium", input.to.marketPremium);

  if (!Number.isFinite(input.riskFreeRate)) {
    throw new RangeError("riskFreeRate must be finite");
  }

  const startModel = modelPrice(
    input.from,
    input.strike,
    input.optionType,
    input.riskFreeRate,
  );
  const endModel = modelPrice(
    input.to,
    input.strike,
    input.optionType,
    input.riskFreeRate,
  );

  const contributions: Record<Factor, number> = {
    spot: 0,
    impliedVolatility: 0,
    timeToExpiry: 0,
  };

  const orders = permutations(FACTORS);
  for (const order of orders) {
    const state: OptionPremiumState = { ...input.from };
    let previousPrice = startModel;

    for (const factor of order) {
      state[factor] = input.to[factor];
      const nextPrice = modelPrice(
        state,
        input.strike,
        input.optionType,
        input.riskFreeRate,
      );
      contributions[factor] += nextPrice - previousPrice;
      previousPrice = nextPrice;
    }
  }

  for (const factor of FACTORS) {
    contributions[factor] /= orders.length;
  }

  const actualPremiumChange = input.to.marketPremium - input.from.marketPremium;
  const modeledPremiumChange = endModel - startModel;

  return {
    actualPremiumChange,
    actualReturnPct: (actualPremiumChange / input.from.marketPremium) * 100,
    modeledPremiumFrom: startModel,
    modeledPremiumTo: endModel,
    modeledPremiumChange,
    spotContribution: contributions.spot,
    volatilityContribution: contributions.impliedVolatility,
    timeContribution: contributions.timeToExpiry,
    residual: actualPremiumChange - modeledPremiumChange,
  };
}
