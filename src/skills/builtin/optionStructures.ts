import { TransactionType } from "../../constants";
import { DhanError } from "../../errors";
import {
  findStrike,
  nearestStrike,
  type NormalizedOptionChain,
} from "../../resources/OptionChain";
import {
  legPremium,
  legSecurityId,
  resolveIndexChain,
  Skill,
  type SkillContext,
  type SkillDefinition,
  type SkillStep,
} from "../Skill";

/** One leg of a prepared option structure. */
export interface IntentLeg {
  action: string;
  optionType: "CE" | "PE";
  strike: number;
  securityId?: string;
  premium?: number;
}

interface OptionSkillContext extends SkillContext {
  symbol: string;
  expiry: string;
  quantity: number;
  spotPrice?: number;
  chain?: NormalizedOptionChain;
  legs?: IntentLeg[];
  intent?: Record<string, unknown>;
}

/**
 * Shared scaffolding for index option structures.
 *
 * Every one of them resolves the index, pulls the chain, picks strikes and
 * stops at an intent — no orders are placed, which is why they sit at
 * `trade_adjacent_read` rather than a write risk level.
 */
abstract class OptionStructureSkill<
  TContext extends OptionSkillContext = OptionSkillContext,
> extends Skill<TContext> {
  protected abstract selectLegs(context: TContext): TContext;
  protected abstract buildIntent(context: TContext): TContext;

  protected steps(): Array<SkillStep<TContext>> {
    return [
      {
        name: "resolve_chain",
        run: async (context) => {
          const { spotPrice, chain } = await resolveIndexChain(
            context.client,
            context.symbol,
            context.expiry,
          );

          return { ...context, spotPrice, chain };
        },
      },
      { name: "select_legs", run: (context) => this.selectLegs(context) },
      { name: "build_intent", run: (context) => this.buildIntent(context) },
    ];
  }

  protected requireChain(context: TContext): {
    chain: NormalizedOptionChain;
    spot: number;
  } {
    if (!context.chain || context.spotPrice === undefined) {
      throw new DhanError("Option chain was not resolved", {
        code: "CHAIN_UNAVAILABLE",
      });
    }

    return { chain: context.chain, spot: context.spotPrice };
  }

  protected leg(
    entry: ReturnType<typeof nearestStrike>,
    optionType: "CE" | "PE",
    action: string,
  ): IntentLeg {
    if (!entry) {
      throw new DhanError("Strike not present in option chain", {
        code: "STRIKE_NOT_FOUND",
      });
    }

    return {
      action,
      optionType,
      strike: entry.strike,
      securityId: legSecurityId(entry, optionType),
      premium: legPremium(entry, optionType),
    };
  }
}

const indexParams = {
  symbol: {
    type: "string",
    required: true,
    description: "Index symbol, e.g. NIFTY or BANKNIFTY",
  },
  expiry: {
    type: "string",
    required: true,
    description: "Option expiry date as YYYY-MM-DD",
  },
} as const;

/** Buy the at-the-money call on an index. */
export class BuyAtmCallSkill extends OptionStructureSkill {
  public readonly definition: SkillDefinition = {
    name: "buy_atm_call",
    description: "Buy an at-the-money call option on an index (e.g. NIFTY).",
    risk: "trade_adjacent_read",
    scope: "orders:read",
    params: {
      ...indexParams,
      quantity: { type: "integer", default: 50 },
      stopLoss: { type: "number", default: 100 },
      target: { type: "number", default: 200 },
    },
  };

  protected selectLegs(context: OptionSkillContext): OptionSkillContext {
    const { chain, spot } = this.requireChain(context);
    const atm = nearestStrike(chain, spot);

    return {
      ...context,
      legs: [this.leg(atm, "CE", TransactionType.BUY)],
    };
  }

  protected buildIntent(context: OptionSkillContext): OptionSkillContext {
    const leg = context.legs?.[0];

    return {
      ...context,
      intent: {
        tradeType: "OPTIONS_BUY",
        symbol: context.symbol,
        expiry: context.expiry,
        instrument: `${context.symbol} ${leg?.strike} CE`,
        securityId: leg?.securityId,
        strike: leg?.strike,
        optionType: "CE",
        quantity: context.quantity,
        premium: leg?.premium,
        stopLoss: context.stopLoss,
        target: context.target,
        note: "Prepared ATM call buy. Await human confirmation.",
      },
    };
  }
}

/** Buy the ATM call and put together — a long volatility position. */
export class StraddleSkill extends OptionStructureSkill {
  public readonly definition: SkillDefinition = {
    name: "straddle",
    description:
      "Build a long straddle: buy ATM call + buy ATM put at the same strike.",
    risk: "trade_adjacent_read",
    scope: "orders:read",
    params: {
      ...indexParams,
      quantity: { type: "integer", default: 25 },
      stopLoss: { type: "number", default: 300 },
      target: { type: "number", default: 600 },
    },
  };

  protected selectLegs(context: OptionSkillContext): OptionSkillContext {
    const { chain, spot } = this.requireChain(context);
    const atm = nearestStrike(chain, spot);

    return {
      ...context,
      atmStrike: atm?.strike,
      legs: [
        this.leg(atm, "CE", TransactionType.BUY),
        this.leg(atm, "PE", TransactionType.BUY),
      ],
    };
  }

  protected buildIntent(context: OptionSkillContext): OptionSkillContext {
    const legs = context.legs ?? [];
    const totalPremium = legs.reduce(
      (total, leg) => total + (leg.premium ?? 0),
      0,
    );
    const strike = Number(context.atmStrike ?? 0);

    return {
      ...context,
      totalPremium,
      intent: {
        tradeType: "STRADDLE",
        symbol: context.symbol,
        expiry: context.expiry,
        quantity: context.quantity,
        legs,
        totalPremium,
        // Both breakevens sit one combined premium away from the strike.
        breakEvenUpside: strike + totalPremium,
        breakEvenDownside: strike - totalPremium,
        stopLoss: context.stopLoss,
        target: context.target,
        note: "Long straddle prepared. Await human confirmation.",
      },
    };
  }
}

/** Buy an OTM call and an OTM put a set percentage either side of spot. */
export class StrangleSkill extends OptionStructureSkill {
  public readonly definition: SkillDefinition = {
    name: "strangle",
    description:
      "Build a long strangle: buy OTM call + buy OTM put around the current spot price.",
    risk: "trade_adjacent_read",
    scope: "orders:read",
    params: {
      ...indexParams,
      quantity: { type: "integer", default: 50 },
      offsetPct: {
        type: "number",
        default: 1,
        description: "Distance of each strike from spot, in percent",
      },
      stopLoss: { type: "number", default: 200 },
      target: { type: "number", default: 400 },
    },
  };

  protected selectLegs(context: OptionSkillContext): OptionSkillContext {
    const { chain, spot } = this.requireChain(context);
    const offset = Number(context.offsetPct ?? 1) / 100;

    return {
      ...context,
      legs: [
        this.leg(
          nearestStrike(chain, spot * (1 + offset)),
          "CE",
          TransactionType.BUY,
        ),
        this.leg(
          nearestStrike(chain, spot * (1 - offset)),
          "PE",
          TransactionType.BUY,
        ),
      ],
    };
  }

  protected buildIntent(context: OptionSkillContext): OptionSkillContext {
    return {
      ...context,
      intent: {
        tradeType: "STRANGLE",
        symbol: context.symbol,
        expiry: context.expiry,
        quantity: context.quantity,
        legs: context.legs,
        stopLoss: context.stopLoss,
        target: context.target,
        note: "Long strangle prepared. Await human confirmation.",
      },
    };
  }
}

/** Sell an OTM call and put, buying wings further out to cap the loss. */
export class IronCondorSkill extends OptionStructureSkill {
  public readonly definition: SkillDefinition = {
    name: "iron_condor",
    description:
      "Build an iron condor: sell OTM call + sell OTM put, buy further OTM call + put for protection.",
    risk: "trade_adjacent_read",
    scope: "orders:read",
    params: {
      ...indexParams,
      quantity: { type: "integer", default: 50 },
      wingWidth: {
        type: "number",
        default: 200,
        description: "Points between the short and long strike on each side",
      },
      maxLoss: { type: "number", default: 5000 },
    },
  };

  protected selectLegs(context: OptionSkillContext): OptionSkillContext {
    const { chain, spot } = this.requireChain(context);
    const wing = Number(context.wingWidth ?? 200);
    const atm = nearestStrike(chain, spot);

    if (!atm) {
      throw new DhanError("Option chain is empty", { code: "CHAIN_EMPTY" });
    }

    // Wings must land on strikes that actually exist — an exact match, not a
    // nearest one, or the condor silently comes out lopsided.
    const shortCall = findStrike(chain, atm.strike + wing);
    const longCall = findStrike(chain, atm.strike + wing * 2);
    const shortPut = findStrike(chain, atm.strike - wing);
    const longPut = findStrike(chain, atm.strike - wing * 2);

    if (!shortCall || !longCall || !shortPut || !longPut) {
      throw new DhanError(
        "Could not build iron condor — insufficient strikes in chain",
        { code: "STRIKE_NOT_FOUND", details: { atmStrike: atm.strike, wing } },
      );
    }

    return {
      ...context,
      atmStrike: atm.strike,
      legs: [
        this.leg(shortCall, "CE", TransactionType.SELL),
        this.leg(longCall, "CE", TransactionType.BUY),
        this.leg(shortPut, "PE", TransactionType.SELL),
        this.leg(longPut, "PE", TransactionType.BUY),
      ],
    };
  }

  protected buildIntent(context: OptionSkillContext): OptionSkillContext {
    return {
      ...context,
      intent: {
        tradeType: "IRON_CONDOR",
        symbol: context.symbol,
        expiry: context.expiry,
        quantity: context.quantity,
        wingWidth: context.wingWidth,
        maxLoss: context.maxLoss,
        legs: context.legs,
        note: "Iron condor prepared. Await human confirmation before execution.",
      },
    };
  }
}

/** Sell an OTM put, buy a further OTM put — bullish, defined risk. */
export class BullPutSpreadSkill extends OptionStructureSkill {
  public readonly definition: SkillDefinition = {
    name: "bull_put_spread",
    description:
      "Build a bull put spread: sell an OTM put, buy a further OTM put for defined risk.",
    risk: "trade_adjacent_read",
    scope: "orders:read",
    params: {
      ...indexParams,
      quantity: { type: "integer", default: 50 },
      spreadWidth: { type: "number", default: 200 },
      maxLoss: { type: "number", default: 5000 },
    },
  };

  protected selectLegs(context: OptionSkillContext): OptionSkillContext {
    const { chain, spot } = this.requireChain(context);
    const spread = Number(context.spreadWidth ?? 200);
    const atm = nearestStrike(chain, spot);

    if (!atm) {
      throw new DhanError("Option chain is empty", { code: "CHAIN_EMPTY" });
    }

    const shortPut = findStrike(chain, atm.strike - spread);
    const longPut = findStrike(chain, atm.strike - spread * 2);

    if (!shortPut || !longPut) {
      throw new DhanError(
        "Could not build bull put spread — insufficient strikes in chain",
        { code: "STRIKE_NOT_FOUND" },
      );
    }

    return {
      ...context,
      legs: [
        this.leg(shortPut, "PE", TransactionType.SELL),
        this.leg(longPut, "PE", TransactionType.BUY),
      ],
    };
  }

  protected buildIntent(context: OptionSkillContext): OptionSkillContext {
    return {
      ...context,
      intent: {
        tradeType: "BULL_PUT_SPREAD",
        symbol: context.symbol,
        expiry: context.expiry,
        quantity: context.quantity,
        spreadWidth: context.spreadWidth,
        maxLoss: context.maxLoss,
        legs: context.legs,
        note: "Bull put spread prepared. Await human confirmation before execution.",
      },
    };
  }
}

/** Sell an OTM call, buy a further OTM call — bearish, defined risk. */
export class BearCallSpreadSkill extends OptionStructureSkill {
  public readonly definition: SkillDefinition = {
    name: "bear_call_spread",
    description:
      "Build a bear call spread: sell an OTM call, buy a further OTM call for defined risk.",
    risk: "trade_adjacent_read",
    scope: "orders:read",
    params: {
      ...indexParams,
      quantity: { type: "integer", default: 50 },
      spreadWidth: { type: "number", default: 200 },
      maxLoss: { type: "number", default: 5000 },
    },
  };

  protected selectLegs(context: OptionSkillContext): OptionSkillContext {
    const { chain, spot } = this.requireChain(context);
    const spread = Number(context.spreadWidth ?? 200);
    const atm = nearestStrike(chain, spot);

    if (!atm) {
      throw new DhanError("Option chain is empty", { code: "CHAIN_EMPTY" });
    }

    const shortCall = findStrike(chain, atm.strike + spread);
    const longCall = findStrike(chain, atm.strike + spread * 2);

    if (!shortCall || !longCall) {
      throw new DhanError(
        "Could not build bear call spread — insufficient strikes in chain",
        { code: "STRIKE_NOT_FOUND" },
      );
    }

    return {
      ...context,
      legs: [
        this.leg(shortCall, "CE", TransactionType.SELL),
        this.leg(longCall, "CE", TransactionType.BUY),
      ],
    };
  }

  protected buildIntent(context: OptionSkillContext): OptionSkillContext {
    return {
      ...context,
      intent: {
        tradeType: "BEAR_CALL_SPREAD",
        symbol: context.symbol,
        expiry: context.expiry,
        quantity: context.quantity,
        spreadWidth: context.spreadWidth,
        maxLoss: context.maxLoss,
        legs: context.legs,
        note: "Bear call spread prepared. Await human confirmation before execution.",
      },
    };
  }
}
