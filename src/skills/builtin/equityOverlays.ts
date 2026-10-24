import { InstrumentType, TransactionType } from "../../constants";
import { DhanError } from "../../errors";
import {
  nearestStrike,
  type NormalizedOptionChain,
} from "../../resources/OptionChain";
import {
  legPremium,
  legSecurityId,
  resolveEquityChain,
  Skill,
  type SkillContext,
  type SkillDefinition,
  type SkillStep,
} from "../Skill";

interface EquityOverlayContext extends SkillContext {
  symbol: string;
  expiry: string;
  quantity: number;
  equitySecurityId?: string;
  spotPrice?: number;
  chain?: NormalizedOptionChain;
  intent?: Record<string, unknown>;
}

const equityParams = {
  symbol: {
    type: "string",
    required: true,
    description: "NSE equity symbol, e.g. RELIANCE",
  },
  expiry: {
    type: "string",
    required: true,
    description: "Option expiry date as YYYY-MM-DD",
  },
  quantity: { type: "integer", default: 100 },
  strikeOffset: {
    type: "number",
    default: 2,
    description: "Distance of the option strike from spot, in percent",
  },
} as const;

/**
 * Shared scaffolding for structures that pair an equity position with an
 * option leg. Like the index structures, these stop at an intent.
 */
abstract class EquityOverlaySkill extends Skill<EquityOverlayContext> {
  protected abstract buildIntent(
    context: EquityOverlayContext,
  ): EquityOverlayContext;

  protected steps(): Array<SkillStep<EquityOverlayContext>> {
    return [
      {
        name: "resolve_chain",
        run: async (context) => {
          const { securityId, spotPrice, chain } = await resolveEquityChain(
            context.client,
            context.symbol,
            context.expiry,
          );

          return { ...context, equitySecurityId: securityId, spotPrice, chain };
        },
      },
      { name: "build_intent", run: (context) => this.buildIntent(context) },
    ];
  }

  protected requireChain(context: EquityOverlayContext): {
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
}

/** Hold the stock, sell an OTM call against it for premium income. */
export class CoveredCallSkill extends EquityOverlaySkill {
  public readonly definition: SkillDefinition = {
    name: "covered_call",
    description:
      "Build a covered call: buy the underlying equity, sell an OTM call against it.",
    risk: "trade_adjacent_read",
    scope: "orders:read",
    params: equityParams,
  };

  protected buildIntent(context: EquityOverlayContext): EquityOverlayContext {
    const { chain, spot } = this.requireChain(context);
    const offset = Number(context.strikeOffset ?? 2) / 100;
    const targetStrike = spot * (1 + offset);
    const call = nearestStrike(chain, targetStrike);

    if (!call) {
      throw new DhanError(
        `Could not find an OTM call strike near ${targetStrike.toFixed(2)}`,
        { code: "STRIKE_NOT_FOUND" },
      );
    }

    const premium = legPremium(call, "CE");

    return {
      ...context,
      callStrike: call.strike,
      callPremium: premium,
      intent: {
        tradeType: "COVERED_CALL",
        symbol: context.symbol,
        expiry: context.expiry,
        quantity: context.quantity,
        spotPrice: spot,
        legs: [
          {
            action: TransactionType.BUY,
            instrumentType: InstrumentType.EQUITY,
            securityId: context.equitySecurityId,
            quantity: context.quantity,
          },
          {
            action: TransactionType.SELL,
            optionType: "CE",
            strike: call.strike,
            securityId: legSecurityId(call, "CE"),
            quantity: context.quantity,
            premium,
          },
        ],
        note:
          `Covered call prepared: buy ${context.quantity} ${context.symbol}, ` +
          `sell ${context.quantity} ${call.strike} CE. Await human confirmation.`,
      },
    };
  }
}

/** Hold the stock, buy an OTM put as downside insurance. */
export class ProtectivePutSkill extends EquityOverlaySkill {
  public readonly definition: SkillDefinition = {
    name: "protective_put",
    description:
      "Build a protective put: buy the underlying equity, buy an OTM put as downside insurance.",
    risk: "trade_adjacent_read",
    scope: "orders:read",
    params: {
      ...equityParams,
      maxPremiumPct: {
        type: "number",
        default: 3,
        description:
          "Reject the structure if the put costs more than this share of spot",
      },
    },
  };

  protected buildIntent(context: EquityOverlayContext): EquityOverlayContext {
    const { chain, spot } = this.requireChain(context);
    const offset = Number(context.strikeOffset ?? 2) / 100;
    const maxPremiumPct = Number(context.maxPremiumPct ?? 3);
    const targetStrike = spot * (1 - offset);
    const put = nearestStrike(chain, targetStrike);

    if (!put) {
      throw new DhanError(
        `Could not find an OTM put strike near ${targetStrike.toFixed(2)}`,
        { code: "STRIKE_NOT_FOUND" },
      );
    }

    const premium = legPremium(put, "PE") ?? 0;
    const premiumPct = (premium / spot) * 100;

    // Insurance that costs more than the configured share of the position is
    // not worth writing an intent for.
    if (premiumPct > maxPremiumPct) {
      throw new DhanError(
        `Put premium ${premiumPct.toFixed(2)}% exceeds max ${maxPremiumPct}%`,
        { code: "PREMIUM_TOO_HIGH", details: { premium, spot } },
      );
    }

    return {
      ...context,
      putStrike: put.strike,
      putPremium: premium,
      intent: {
        tradeType: "PROTECTIVE_PUT",
        symbol: context.symbol,
        expiry: context.expiry,
        quantity: context.quantity,
        spotPrice: spot,
        premiumPct: Number(premiumPct.toFixed(2)),
        legs: [
          {
            action: TransactionType.BUY,
            instrumentType: InstrumentType.EQUITY,
            securityId: context.equitySecurityId,
            quantity: context.quantity,
          },
          {
            action: TransactionType.BUY,
            optionType: "PE",
            strike: put.strike,
            securityId: legSecurityId(put, "PE"),
            quantity: context.quantity,
            premium,
          },
        ],
        note:
          `Protective put prepared: buy ${context.quantity} ${context.symbol}, ` +
          `buy ${context.quantity} ${put.strike} PE. Await human confirmation.`,
      },
    };
  }
}
