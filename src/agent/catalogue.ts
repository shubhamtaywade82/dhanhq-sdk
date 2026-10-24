import type { DhanClient } from "../client/DhanClient";
import { RiskViolationError } from "../errors";
import { Pipeline, riskTypeFor } from "../risk/Pipeline";
import type { SkillRegistry } from "../skills/Registry";
import { TechnicalAnalysis } from "../ta/TechnicalAnalysis";
import { analyzeMultiTimeframe } from "../ta/multiTimeframe";
import { previewOrder } from "./OrderPreview";
import {
  cancelSchema,
  emptySchema,
  expiredOptionsSchema,
  expiryListSchema,
  feedSchema,
  globalEstimateToolSchema,
  globalOrderSchema,
  historicalSchema,
  intradaySchema,
  killSwitchSchema,
  marginSchema,
  modifyOrderSchema,
  optionChainSchema,
  orderSchema,
  pnlExitSchema,
  searchSchema,
  skillInputSchema,
  technicalsSchema,
} from "./schemas";
import type { Tool } from "./Tool";

/** Version stamped on a tool definition that does not declare its own. */
export const DEFAULT_TOOL_VERSION = "1.0.0";

export interface CatalogueDependencies {
  client: DhanClient;
  skills: SkillRegistry;
  pipeline: Pipeline;
}

function tool(definition: Omit<Tool, "version"> & { version?: string }): Tool {
  return { version: DEFAULT_TOOL_VERSION, ...definition };
}

/**
 * The catalogue of tools exposed to MCP clients and agent runtimes: what
 * exists, at what scope, at what risk, and which handler carries it out.
 *
 * Declarative on purpose — adding an endpoint means adding an entry here and
 * a schema in `schemas.ts`. Policy enforcement lives in
 * {@link AgentToolRegistry}, so handlers here carry no scope checks of their
 * own.
 */
export function buildCatalogue(deps: CatalogueDependencies): Tool[] {
  return [
    ...portfolioTools(deps),
    ...marketTools(deps),
    ...analysisTools(deps),
    ...orderTools(deps),
    ...traderControlTools(deps),
    ...globalStocksTools(deps),
    ...skillTools(deps),
  ];
}

function portfolioTools({ client }: CatalogueDependencies): Tool[] {
  return [
    tool({
      name: "dhan_profile",
      description: "Fetch the Dhan account profile",
      scope: "portfolio:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: {
        type: "object",
        properties: { dhanClientId: { type: "string" } },
      },
      handler: () => client.profile.get(),
    }),
    tool({
      name: "dhan_funds",
      description: "Fetch fund limits and available balance",
      scope: "portfolio:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: {
        type: "object",
        properties: { availabelBalance: { type: "number" } },
      },
      handler: () => client.funds.getLimit(),
    }),
    tool({
      name: "dhan_holdings",
      description: "List equity holdings",
      scope: "portfolio:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: { type: "array", items: { type: "object" } },
      handler: () => client.positions.listHoldings(),
    }),
    tool({
      name: "dhan_positions",
      description: "List open positions",
      scope: "portfolio:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: { type: "array", items: { type: "object" } },
      handler: () => client.positions.list(),
    }),
    tool({
      name: "dhan_orders",
      description: "List today's orders",
      scope: "orders:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: { type: "array", items: { type: "object" } },
      handler: () => client.orders.list(),
    }),
    tool({
      name: "dhan_trades",
      description: "List today's trades",
      scope: "orders:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: { type: "array", items: { type: "object" } },
      handler: () => client.orders.listTrades(),
    }),
  ];
}

function marketTools({ client }: CatalogueDependencies): Tool[] {
  return [
    tool({
      name: "dhan_search_instruments",
      description: "Resolve symbols to Dhan security ids",
      scope: "market:read",
      risk: "read_only",
      inputSchema: searchSchema,
      outputSchema: { type: "array", items: { type: "object" } },
      examples: [
        {
          input: { query: "RELIANCE" },
          output: '[{ "securityId": "2885", "symbolName": "RELIANCE" }]',
        },
      ],
      handler: (args) =>
        client.instruments.search(String(args.query), {
          segments: args.segments as string[] | undefined,
          limit: args.limit as number | undefined,
          exactMatch: args.exactMatch as boolean | undefined,
        }),
    }),
    tool({
      name: "dhan_ltp",
      description: "Fetch last traded prices for up to 1000 instruments",
      scope: "market:read",
      risk: "read_only",
      inputSchema: feedSchema,
      outputSchema: { type: "object" },
      handler: (args) => client.marketFeed.ltp(args.instruments as never),
    }),
    tool({
      name: "dhan_ohlc",
      description: "Fetch open/high/low/close for up to 1000 instruments",
      scope: "market:read",
      risk: "read_only",
      inputSchema: feedSchema,
      outputSchema: { type: "object" },
      handler: (args) => client.marketFeed.ohlc(args.instruments as never),
    }),
    tool({
      name: "dhan_quote",
      description: "Fetch full quotes with market depth and open interest",
      scope: "market:read",
      risk: "read_only",
      inputSchema: feedSchema,
      outputSchema: { type: "object" },
      handler: (args) => client.marketFeed.quote(args.instruments as never),
    }),
    tool({
      name: "dhan_option_chain",
      description: "Fetch the option chain for an underlying and expiry",
      scope: "market:read",
      risk: "read_only",
      inputSchema: optionChainSchema,
      outputSchema: { type: "object" },
      handler: (args) => client.optionChain.fetchNormalized(args as never),
    }),
    tool({
      name: "dhan_option_expiries",
      description: "List available option expiry dates for an underlying",
      scope: "market:read",
      risk: "read_only",
      inputSchema: expiryListSchema,
      outputSchema: { type: "object" },
      handler: (args) => client.optionChain.expiryList(args as never),
    }),
    tool({
      name: "dhan_historical_data",
      description: "Fetch daily historical candles",
      scope: "market:read",
      risk: "read_only",
      inputSchema: historicalSchema,
      outputSchema: { type: "object" },
      handler: (args) => client.charts.historical(args as never),
    }),
    tool({
      name: "dhan_intraday_data",
      description: "Fetch intraday candles at a minute interval",
      scope: "market:read",
      risk: "read_only",
      inputSchema: intradaySchema,
      outputSchema: { type: "object" },
      handler: (args) => client.charts.intraday(args as never),
    }),
    tool({
      name: "dhan_expired_options",
      description: "Fetch historical candles for expired options contracts",
      scope: "market:read",
      risk: "read_only",
      inputSchema: expiredOptionsSchema,
      outputSchema: { type: "object" },
      handler: (args) => client.expiredOptionsData.fetch(args as never),
    }),
  ];
}

function analysisTools({ client }: CatalogueDependencies): Tool[] {
  return [
    tool({
      name: "dhan_technical_analysis",
      description:
        "Compute multi-timeframe indicators (RSI, MACD, ADX, ATR, Bollinger, Supertrend) for an instrument",
      scope: "market:read",
      risk: "read_only",
      inputSchema: technicalsSchema,
      outputSchema: { type: "object" },
      handler: async (args) => {
        const analysis = new TechnicalAnalysis(client.charts);
        return analysis.compute({
          securityId: String(args.securityId),
          exchangeSegment: String(args.exchangeSegment),
          instrument: String(args.instrument),
          intervals: args.intervals as number[] | undefined,
          daysBack: args.daysBack as number | undefined,
        });
      },
    }),
    tool({
      name: "dhan_market_bias",
      description:
        "Blend multi-timeframe indicators into a single directional bias with rationale",
      scope: "market:read",
      risk: "read_only",
      inputSchema: technicalsSchema,
      outputSchema: {
        type: "object",
        properties: {
          summary: {
            type: "object",
            properties: {
              bias: { type: "string" },
              confidence: { type: "number" },
            },
          },
        },
      },
      handler: async (args) => {
        const analysis = new TechnicalAnalysis(client.charts);
        const result = await analysis.compute({
          securityId: String(args.securityId),
          exchangeSegment: String(args.exchangeSegment),
          instrument: String(args.instrument),
          intervals: args.intervals as number[] | undefined,
          daysBack: args.daysBack as number | undefined,
        });

        return analyzeMultiTimeframe(result);
      },
    }),
    tool({
      name: "dhan_margin_requirement",
      description: "Calculate the margin required for a prospective order",
      scope: "orders:read",
      risk: "trade_adjacent_read",
      inputSchema: marginSchema,
      outputSchema: { type: "object" },
      handler: (args) => client.funds.calculateMargin(args as never),
    }),
  ];
}

function orderTools({ client, pipeline }: CatalogueDependencies): Tool[] {
  return [
    tool({
      name: "dhan_order_preview",
      description:
        "Validate and summarize an order, including risk checks, without placing it",
      scope: "orders:read",
      risk: "trade_adjacent_read",
      inputSchema: orderSchema,
      outputSchema: {
        type: "object",
        properties: {
          valid: { type: "boolean" },
          errors: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
      },
      handler: async (args) => {
        const instrument = await resolveInstrument(client, args);
        return previewOrder(args, { pipeline, instrument });
      },
    }),
    tool({
      name: "dhan_place_order",
      description: "Place an order after external confirmation",
      scope: "orders:write",
      risk: "live_write",
      inputSchema: orderSchema,
      outputSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
      },
      handler: async (args) => {
        const instrument = await resolveInstrument(client, args);

        // Refusing an order whose instrument cannot be resolved is deliberate:
        // without scrip-master metadata the surveillance, product-support and
        // permission checks cannot run at all.
        if (!instrument) {
          throw new RiskViolationError(
            "instrument_resolution",
            `Cannot verify risk for unknown instrument: ${args.exchangeSegment}:${args.securityId}`,
          );
        }

        await pipeline.run({
          args: args as never,
          instrument,
          type: riskTypeFor(instrument),
        });

        return client.orders.place(args as never);
      },
    }),
    tool({
      name: "dhan_modify_order",
      description: "Modify a pending order",
      scope: "orders:write",
      risk: "live_write",
      inputSchema: modifyOrderSchema,
      outputSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
      },
      handler: (args) => client.orders.modify(args as never),
    }),
    tool({
      name: "dhan_cancel_order",
      description: "Cancel a pending order",
      scope: "orders:cancel",
      risk: "destructive_write",
      inputSchema: cancelSchema,
      outputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          orderStatus: { type: "string" },
        },
      },
      handler: (args) => client.orders.cancel(String(args.orderId)),
    }),
  ];
}

/**
 * Account-level protective controls. These are the only tools on the
 * `risk:write` scope — an agent that may place orders does not automatically
 * get to disarm the account's own safety rails.
 */
function traderControlTools({ client }: CatalogueDependencies): Tool[] {
  return [
    tool({
      name: "dhan_kill_switch_status",
      description: "Check whether the account-level kill switch is active",
      scope: "portfolio:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: { type: "object" },
      handler: () => client.traderControls.getKillSwitchStatus(),
    }),
    tool({
      name: "dhan_kill_switch",
      description:
        "Activate or deactivate the kill switch, which blocks all trading for the day",
      scope: "risk:write",
      risk: "destructive_write",
      inputSchema: killSwitchSchema,
      outputSchema: { type: "object" },
      handler: (args) =>
        client.traderControls.setKillSwitch(String(args.killSwitchStatus)),
    }),
    tool({
      name: "dhan_pnl_exit_status",
      description: "Read the configured profit/loss auto-exit thresholds",
      scope: "portfolio:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: { type: "object" },
      handler: () => client.traderControls.getPnlExit(),
    }),
    tool({
      name: "dhan_set_pnl_exit",
      description:
        "Set profit/loss thresholds that auto-square-off all positions when hit",
      scope: "risk:write",
      risk: "live_write",
      inputSchema: pnlExitSchema,
      outputSchema: { type: "object" },
      handler: (args) => client.traderControls.setPnlExit(args as never),
    }),
    tool({
      name: "dhan_stop_pnl_exit",
      description: "Remove the configured profit/loss auto-exit thresholds",
      scope: "risk:write",
      risk: "destructive_write",
      inputSchema: emptySchema,
      outputSchema: { type: "object" },
      handler: () => client.traderControls.stopPnlExit(),
    }),
  ];
}

/**
 * The Global Stocks (US equities) book gets its own tools rather than extra
 * flags on the domestic ones — an agent asked for "my holdings" should never
 * silently blend USD positions into the INR book.
 */
function globalStocksTools({ client }: CatalogueDependencies): Tool[] {
  return [
    tool({
      name: "dhan_global_holdings",
      description: "List US stock holdings",
      scope: "portfolio:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: { type: "array", items: { type: "object" } },
      handler: () => client.globalStocks.holdings.list(),
    }),
    tool({
      name: "dhan_global_funds",
      description: "Fetch US (USD) fund limits",
      scope: "portfolio:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: {
        type: "object",
        properties: { availableCash: { type: "number" } },
      },
      handler: () => client.globalStocks.funds.getLimit(),
    }),
    tool({
      name: "dhan_global_orders",
      description: "List US stock orders",
      scope: "orders:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: { type: "array", items: { type: "object" } },
      handler: () => client.globalStocks.orders.list(),
    }),
    tool({
      name: "dhan_global_trades",
      description: "List US stock trades",
      scope: "orders:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: { type: "array", items: { type: "object" } },
      handler: () => client.globalStocks.trades.list(),
    }),
    tool({
      name: "dhan_global_market_status",
      description: "Check whether the US market is currently open",
      scope: "market:read",
      risk: "read_only",
      inputSchema: emptySchema,
      outputSchema: {
        type: "object",
        properties: { status: { type: "string" } },
      },
      handler: () => client.globalStocks.marketStatus.get(),
    }),
    tool({
      name: "dhan_global_order_estimate",
      description:
        "Estimate charges and margin for a US stock order without placing it",
      scope: "orders:read",
      risk: "trade_adjacent_read",
      inputSchema: globalEstimateToolSchema,
      outputSchema: {
        type: "object",
        properties: {
          totalCharges: { type: "number" },
          totalMargin: { type: "number" },
          sufficient: { type: "boolean" },
        },
      },
      handler: (args) => client.globalStocks.costSummary(args as never),
    }),
    tool({
      name: "dhan_global_place_order",
      description: "Place a US stock order after external confirmation",
      scope: "orders:write",
      risk: "live_write",
      inputSchema: globalOrderSchema,
      outputSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
      },
      // No risk-pipeline run here: its checks resolve instruments from the
      // Indian scrip master and encode NSE/BSE rules, neither of which applies
      // to US equities. The scope and live-trading gates still apply, as does
      // the Global Stocks order contract.
      handler: (args) => client.globalStocks.orders.place(args as never),
    }),
    tool({
      name: "dhan_global_modify_order",
      description: "Modify a pending US stock order",
      scope: "orders:write",
      risk: "live_write",
      inputSchema: globalOrderSchema,
      outputSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
      },
      handler: (args) => client.globalStocks.orders.modify(args as never),
    }),
    tool({
      name: "dhan_global_cancel_order",
      description: "Cancel a pending US stock order",
      scope: "orders:cancel",
      risk: "destructive_write",
      inputSchema: cancelSchema,
      outputSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
      },
      handler: (args) =>
        client.globalStocks.orders.cancel(String(args.orderId)),
    }),
  ];
}

/**
 * Exposes each registered skill as `dhan_skill_<name>`, gated by the risk and
 * scope the skill itself declares.
 */
function skillTools({ client, skills }: CatalogueDependencies): Tool[] {
  return skills.list().map((skill) =>
    tool({
      name: `dhan_skill_${skill.name}`,
      description: skill.description,
      scope: skill.scope,
      risk: skill.risk,
      inputSchema: skillInputSchema(skill.params),
      handler: (args) => skills.call(skill.name, args, client),
    }),
  );
}

async function resolveInstrument(
  client: DhanClient,
  args: Record<string, unknown>,
) {
  if (!args.exchangeSegment || !args.securityId) {
    return undefined;
  }

  return client.instruments.findBySecurityId(
    String(args.exchangeSegment),
    String(args.securityId),
  );
}
