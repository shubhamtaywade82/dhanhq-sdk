import {
  highestCallOi,
  highestPutOi,
  maxPain,
  openInterestFromChain,
  putCallRatio,
} from "../../analytics";
import { DhanError } from "../../errors";
import type { Instrument } from "../../resources/Instruments";
import {
  nearestStrike,
  type NormalizedOptionChain,
} from "../../resources/OptionChain";
import { candlesFromSeries, closes } from "../../ta/candles";
import { latest, rsi, sma } from "../../ta/indicators";
import { todayOrLastTradingDay, tradingDaysAgo } from "../../ta/marketCalendar";
import {
  Skill,
  type SkillContext,
  type SkillDefinition,
  type SkillStep,
} from "../Skill";

interface SummarizerContext extends SkillContext {
  underlyingSymbol: string;
  mode: "both" | "technicals" | "option_chain";
  instrument?: Instrument;
  technicalSummary?: Record<string, unknown>;
  optionChainSummary?: Record<string, unknown>;
  summary?: Record<string, unknown>;
}

/**
 * Read-only market context for a symbol: trend and momentum from daily
 * candles, plus positioning from the option chain.
 *
 * The one builtin that touches no order path at all, hence `read_only`.
 */
export class MarketDataSummarizerSkill extends Skill<SummarizerContext> {
  public readonly definition: SkillDefinition = {
    name: "market_data_summarizer",
    description:
      "Summarize technicals and/or option chain (PCR, OI walls, max pain, ATM strikes) for a symbol.",
    risk: "read_only",
    scope: "market:read",
    params: {
      underlyingSymbol: {
        type: "string",
        required: true,
        description: "Underlying ticker symbol, e.g. NIFTY or RELIANCE",
      },
      mode: {
        type: "string",
        default: "both",
        description: "One of: both, technicals, option_chain",
      },
      rangeDays: {
        type: "integer",
        default: 60,
        description: "Trading days of daily candles to analyze",
      },
      expiry: {
        type: "string",
        default: "nearest",
        description: "Expiry date as YYYY-MM-DD, or 'nearest'",
      },
      strikeRange: {
        type: "integer",
        default: 5,
        description: "Strikes to include either side of ATM",
      },
    },
  };

  protected steps(): Array<SkillStep<SummarizerContext>> {
    return [
      { name: "resolve_instrument", run: (context) => this.resolve(context) },
      { name: "fetch_technicals", run: (context) => this.technicals(context) },
      {
        name: "fetch_option_chain",
        run: (context) => this.optionChain(context),
      },
      {
        name: "prepare_summary",
        run: (context) => ({
          ...context,
          summary: {
            symbol: context.underlyingSymbol,
            securityId: context.instrument?.securityId,
            exchangeSegment: context.instrument?.exchangeSegment,
            technicals: context.technicalSummary,
            optionChain: context.optionChainSummary,
          },
        }),
      },
    ];
  }

  /** Indices first, then cash equity, then a broad search. */
  private async resolve(
    context: SummarizerContext,
  ): Promise<SummarizerContext> {
    const symbol = String(context.underlyingSymbol).trim().toUpperCase();

    const instrument =
      (await context.client.instruments.find("IDX_I", symbol, {
        exactMatch: true,
      })) ??
      (await context.client.instruments.find("NSE_EQ", symbol, {
        exactMatch: true,
      })) ??
      (await context.client.instruments.findAnywhere(symbol));

    if (!instrument) {
      throw new DhanError(`Underlying symbol not found: ${symbol}`, {
        code: "INSTRUMENT_NOT_FOUND",
        details: { symbol },
      });
    }

    return { ...context, instrument };
  }

  private async technicals(
    context: SummarizerContext,
  ): Promise<SummarizerContext> {
    if (context.mode !== "both" && context.mode !== "technicals") {
      return context;
    }

    const instrument = context.instrument;
    if (!instrument) {
      return context;
    }

    const toDate = todayOrLastTradingDay();
    const rangeDays = Number(context.rangeDays ?? 60);
    const fromDate = tradingDaysAgo(toDate, Math.max(rangeDays, 60));

    const response = await context.client.charts.historical({
      securityId: instrument.securityId,
      exchangeSegment: instrument.exchangeSegment as never,
      instrument: instrument.instrument as never,
      fromDate,
      toDate,
    });

    const candles = candlesFromSeries(response);

    if (candles.length === 0) {
      const ltp = await context.client.marketFeed.ltpFor(
        instrument.exchangeSegment ?? "NSE_EQ",
        instrument.securityId,
      );

      return {
        ...context,
        technicalSummary: {
          ltp: ltp ?? null,
          note: "No historical candles available; using a quote snapshot instead.",
        },
      };
    }

    const closeSeries = closes(candles);
    const previous = closeSeries[closeSeries.length - 6];
    const last = closeSeries[closeSeries.length - 1];

    return {
      ...context,
      technicalSummary: {
        ltp: last,
        sma20: round(latest(sma(closeSeries, 20))),
        sma50: round(latest(sma(closeSeries, 50))),
        rsi14: round(latest(rsi(closeSeries, 14))),
        return5dPct: previous ? round((last / previous - 1) * 100) : null,
        dataPointsAnalyzed: closeSeries.length,
        from: fromDate,
        to: toDate,
      },
    };
  }

  private async optionChain(
    context: SummarizerContext,
  ): Promise<SummarizerContext> {
    if (context.mode !== "both" && context.mode !== "option_chain") {
      return context;
    }

    const instrument = context.instrument;
    if (!instrument) {
      return context;
    }

    const underlyingSeg =
      instrument.exchangeSegment === "IDX_I" ? "IDX_I" : "NSE_EQ";
    const underlyingScrip = Number(instrument.securityId);

    let expiry = String(context.expiry ?? "nearest");
    if (expiry === "" || expiry === "nearest") {
      const expiries = await context.client.optionChain.expiryList({
        underlyingScrip,
        underlyingSeg,
      });

      const nearest = expiries.data?.[0];
      if (!nearest) {
        return context;
      }

      expiry = nearest;
    }

    const chain = await context.client.optionChain.fetchNormalized({
      underlyingScrip,
      underlyingSeg,
      expiry,
    });

    return {
      ...context,
      optionChainSummary: summarizeChain(
        chain,
        expiry,
        Number(context.strikeRange ?? 5),
      ),
    };
  }
}

function summarizeChain(
  chain: NormalizedOptionChain,
  expiry: string,
  strikeRange: number,
): Record<string, unknown> {
  const spot = chain.lastPrice ?? 0;
  const atm = nearestStrike(chain, spot);
  const atmIndex = atm
    ? chain.strikes.findIndex((entry) => entry.strike === atm.strike)
    : 0;

  const start = Math.max(0, atmIndex - strikeRange);
  const end = Math.min(chain.strikes.length, atmIndex + strikeRange + 1);
  const openInterest = openInterestFromChain(chain);

  return {
    expiry,
    spot,
    atmStrike: atm?.strike ?? null,
    pcr: round(putCallRatio(openInterest), 3),
    maxPain: maxPain(openInterest) ?? null,
    resistanceWalls: highestCallOi(chain, 3),
    supportWalls: highestPutOi(chain, 3),
    strikes: chain.strikes.slice(start, end).map((entry) => ({
      strike: entry.strike,
      ce: entry.call
        ? {
            securityId: entry.call.security_id,
            ltp: entry.call.last_price,
            oi: entry.call.oi,
            iv: entry.call.implied_volatility,
          }
        : null,
      pe: entry.put
        ? {
            securityId: entry.put.security_id,
            ltp: entry.put.last_price,
            oi: entry.put.oi,
            iv: entry.put.implied_volatility,
          }
        : null,
    })),
  };
}

function round(value: number | null, digits = 2): number | null {
  return value === null ? null : Number(value.toFixed(digits));
}
