import type {
  TechnicalAnalysisResult,
  TimeframeIndicators,
  TimeframeKey,
} from "./TechnicalAnalysis";

export type Momentum =
  "overbought" | "oversold" | "bullish" | "bearish" | "neutral" | "unknown";
export type TrendStrength = "strong" | "moderate" | "weak" | "unknown";
export type Signal = "bullish" | "bearish" | "neutral" | "unknown";
export type Bias = "bullish" | "bearish" | "neutral";
export type Setup = "buy_on_dip" | "sell_on_rise" | "range_trade";

export interface TimeframeClassification {
  momentum: Momentum;
  trend: TrendStrength;
  macdSignal: Signal;
  volatility: "expanding" | "flat" | "unknown";
  bias: Bias;
}

export interface MultiTimeframeSummary {
  meta: TechnicalAnalysisResult["meta"] | Record<string, never>;
  perTimeframe: Partial<Record<TimeframeKey, TimeframeClassification>>;
  summary: {
    bias: Bias;
    setup: Setup;
    /** Weighted score in `[0, 1]`; 1 is unanimously bullish. */
    confidence: number;
    rationale: {
      rsi: string;
      macd: string;
      adx: string;
      atr: string;
    };
    trendStrength: TrendStrength;
  };
}

/** Higher timeframes carry more weight in the blended bias. */
const TIMEFRAME_WEIGHTS: Record<TimeframeKey, number> = {
  m1: 1,
  m5: 2,
  m15: 3,
  m25: 3,
  m60: 4,
};

const BIAS_SCORES: Record<Bias, number> = {
  bullish: 1,
  neutral: 0.5,
  bearish: 0,
};

const TIMEFRAME_ORDER: TimeframeKey[] = ["m1", "m5", "m15", "m25", "m60"];

/**
 * Blends per-timeframe indicator readings into a single directional bias.
 *
 * Each timeframe is classified independently, then scored and weighted by
 * horizon — a 60-minute reading counts four times a 1-minute one.
 */
export function analyzeMultiTimeframe(
  data: Pick<TechnicalAnalysisResult, "indicators"> &
    Partial<Pick<TechnicalAnalysisResult, "meta">>,
): MultiTimeframeSummary {
  const perTimeframe: Partial<Record<TimeframeKey, TimeframeClassification>> =
    {};

  for (const key of TIMEFRAME_ORDER) {
    const indicators = data.indicators[key];
    if (indicators) {
      perTimeframe[key] = classify(indicators);
    }
  }

  const entries = Object.entries(perTimeframe) as Array<
    [TimeframeKey, TimeframeClassification]
  >;

  let totalWeight = 0;
  let accumulated = 0;
  for (const [key, classification] of entries) {
    const weight = TIMEFRAME_WEIGHTS[key] ?? 1;
    totalWeight += weight;
    accumulated += BIAS_SCORES[classification.bias] * weight;
  }

  const confidence = totalWeight === 0 ? 0.5 : accumulated / totalWeight;
  const bias: Bias =
    confidence >= 0.66 ? "bullish" : confidence <= 0.33 ? "bearish" : "neutral";
  const setup: Setup =
    bias === "bullish"
      ? "buy_on_dip"
      : bias === "bearish"
        ? "sell_on_rise"
        : "range_trade";

  const classifications = entries.map(([, value]) => value);

  return {
    meta: data.meta ?? {},
    perTimeframe,
    summary: {
      bias,
      setup,
      confidence: Number(confidence.toFixed(2)),
      rationale: {
        rsi: rsiRationale(classifications),
        macd: macdRationale(classifications),
        adx: adxRationale(classifications),
        atr: atrRationale(classifications),
      },
      trendStrength: aggregateTrendStrength(classifications),
    },
  };
}

function classify(indicators: TimeframeIndicators): TimeframeClassification {
  const momentum = classifyRsi(indicators.rsi);
  const macdSignal = classifyMacd(
    indicators.macd.macd,
    indicators.macd.signal,
    indicators.macd.hist,
  );

  return {
    momentum,
    trend: classifyAdx(indicators.adx),
    macdSignal,
    volatility: classifyAtr(indicators.atr),
    bias: deriveBias(momentum, macdSignal),
  };
}

function classifyRsi(value: number | null): Momentum {
  if (value === null) return "unknown";
  if (value >= 70) return "overbought";
  if (value <= 30) return "oversold";
  if (value >= 55) return "bullish";
  if (value <= 45) return "bearish";
  return "neutral";
}

function classifyAdx(value: number | null): TrendStrength {
  if (value === null) return "unknown";
  if (value >= 25) return "strong";
  if (value <= 15) return "weak";
  return "moderate";
}

function classifyMacd(
  macdValue: number | null,
  signal: number | null,
  histogram: number | null,
): Signal {
  if (macdValue === null || signal === null) return "unknown";

  if (macdValue > signal && (histogram === null || histogram >= 0)) {
    return "bullish";
  }

  if (macdValue < signal && (histogram === null || histogram <= 0)) {
    return "bearish";
  }

  return "neutral";
}

function classifyAtr(value: number | null): "expanding" | "flat" | "unknown" {
  if (value === null) return "unknown";
  return value > 0 ? "expanding" : "flat";
}

/**
 * A timeframe only counts as directional when momentum and MACD agree —
 * either alone flips too often to trade on.
 */
function deriveBias(momentum: Momentum, macdSignal: Signal): Bias {
  if (momentum === "bullish" && macdSignal === "bullish") return "bullish";
  if (momentum === "bearish" && macdSignal === "bearish") return "bearish";
  return "neutral";
}

function rsiRationale(entries: TimeframeClassification[]): string {
  const ups = entries.filter((entry) =>
    ["bullish", "overbought"].includes(entry.momentum),
  ).length;
  const downs = entries.filter((entry) =>
    ["bearish", "oversold"].includes(entry.momentum),
  ).length;

  if (ups > downs) return `Upward momentum across ${ups} timeframes`;
  if (downs > ups) return `Downward momentum across ${downs} timeframes`;
  return "Mixed RSI momentum";
}

function macdRationale(entries: TimeframeClassification[]): string {
  const ups = entries.filter((entry) => entry.macdSignal === "bullish").length;
  const downs = entries.filter(
    (entry) => entry.macdSignal === "bearish",
  ).length;

  if (ups > downs) return "MACD bullish signals dominant";
  if (downs > ups) return "MACD bearish signals dominant";
  return "MACD mixed/neutral";
}

function adxRationale(entries: TimeframeClassification[]): string {
  const strong = entries.filter((entry) => entry.trend === "strong").length;
  if (strong >= 2) return "Strong higher timeframe trend";

  const moderate = entries.filter((entry) => entry.trend === "moderate").length;
  if (moderate >= 2) return "Moderate trend strength";

  return "Weak or undefined trend";
}

function atrRationale(entries: TimeframeClassification[]): string {
  const expanding = entries.filter(
    (entry) => entry.volatility === "expanding",
  ).length;

  return expanding >= entries.length / 2
    ? "Volatility expanding"
    : "Volatility subdued";
}

function aggregateTrendStrength(
  entries: TimeframeClassification[],
): TrendStrength {
  if (entries.length === 0) return "unknown";

  const strong = entries.filter((entry) => entry.trend === "strong").length;
  const weak = entries.filter((entry) => entry.trend === "weak").length;

  if (strong >= entries.length / 2) return "strong";
  if (weak >= entries.length / 2) return "weak";
  return "moderate";
}
