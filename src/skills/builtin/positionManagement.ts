import { DhanError } from "../../errors";
import {
  Skill,
  type SkillContext,
  type SkillDefinition,
  type SkillStep,
} from "../Skill";

interface PositionContext extends SkillContext {
  positions?: Array<Record<string, unknown>>;
  exited?: boolean;
}

/**
 * Exit every open position at market.
 *
 * Destructive and irreversible during market hours, hence `destructive_write`
 * — it needs `orders:write` *and* the live-trading gate.
 */
export class SquareOffAllSkill extends Skill<PositionContext> {
  public readonly definition: SkillDefinition = {
    name: "square_off_all",
    description: "Exit all open positions at market price.",
    risk: "destructive_write",
    scope: "orders:write",
    params: {},
  };

  protected steps(): Array<SkillStep<PositionContext>> {
    return [
      {
        name: "fetch_positions",
        run: async (context) => {
          const positions = await context.client.positions.list();
          const open = positions.filter(
            (position) => Number(position.netQty ?? 0) !== 0,
          );

          return {
            ...context,
            positions: open as Array<Record<string, unknown>>,
          };
        },
      },
      {
        name: "exit_positions",
        run: async (context) => {
          const open = context.positions ?? [];

          // Nothing open means nothing to exit — calling the endpoint anyway
          // would report a failure for a no-op.
          if (open.length === 0) {
            return { ...context, exited: false, openCount: 0 };
          }

          // `DELETE /v2/positions` squares off the whole book in one call, so
          // this runs once rather than per position.
          const result = await context.client.positions.exitAll();

          return {
            ...context,
            exited: true,
            openCount: open.length,
            exitResult: result,
          };
        },
      },
    ];
  }
}

/** Exit one named position, identified by symbol and segment. */
export class SquareOffPositionSkill extends Skill<PositionContext> {
  public readonly definition: SkillDefinition = {
    name: "square_off_position",
    description:
      "Exit a specific open position by symbol and exchange segment.",
    risk: "destructive_write",
    scope: "orders:write",
    params: {
      symbol: { type: "string", required: true },
      exchangeSegment: { type: "string", required: true },
    },
  };

  protected steps(): Array<SkillStep<PositionContext>> {
    return [
      {
        name: "find_position",
        run: async (context) => {
          const symbol = String(context.symbol).toUpperCase();
          const segment = String(context.exchangeSegment);
          const positions = await context.client.positions.list();

          const target = positions.find(
            (position) =>
              String(position.exchangeSegment ?? "") === segment &&
              String(position.tradingSymbol ?? "").toUpperCase() === symbol &&
              Number(position.netQty ?? 0) !== 0,
          );

          if (!target) {
            throw new DhanError(
              `No open position found for ${symbol} on ${segment}`,
              { code: "POSITION_NOT_FOUND", details: { symbol, segment } },
            );
          }

          return {
            ...context,
            position: target,
            securityId: target.securityId,
            netQuantity: Number(target.netQty ?? 0),
          };
        },
      },
      {
        name: "exit_position",
        run: async (context) => {
          const position = context.position as Record<string, unknown>;
          const netQuantity = Number(context.netQuantity ?? 0);

          // A long is closed by selling and a short by buying, so the exit side
          // is the opposite of the position's sign.
          const result = await context.client.orders.place({
            transactionType: netQuantity > 0 ? "SELL" : "BUY",
            exchangeSegment: String(position.exchangeSegment) as never,
            productType: String(position.productType) as never,
            orderType: "MARKET",
            validity: "DAY",
            quantity: Math.abs(netQuantity),
            securityId: String(position.securityId),
          });

          return { ...context, exited: true, exitResult: result };
        },
      },
    ];
  }
}
