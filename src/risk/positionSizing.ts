/**
 * Position sizing and stop-loss placement.
 *
 * All functions are pure — they take numbers and return numbers, so they can
 * be used for planning without any API access.
 */

export interface FixedRiskSizingInput {
  accountBalance: number;
  /** Share of the account to risk on this trade, in percent (`2` for 2%). */
  riskPercent: number;
  entryPrice: number;
  stopLossPrice: number;
  /** Rounds down to a whole multiple of the lot size. Defaults to 1. */
  lotSize?: number;
}

/** Quantity such that a stop-out costs `riskPercent` of the account. */
export function fixedRiskSize(input: FixedRiskSizingInput): number {
  const { accountBalance, riskPercent, entryPrice, stopLossPrice } = input;
  const lotSize = input.lotSize ?? 1;

  if (accountBalance <= 0 || entryPrice <= 0 || stopLossPrice <= 0) {
    return 0;
  }

  const riskPerShare = Math.abs(entryPrice - stopLossPrice);
  if (riskPerShare === 0) {
    return 0;
  }

  const riskAmount = accountBalance * (riskPercent / 100);
  const rawShares = Math.floor(riskAmount / riskPerShare);

  return Math.floor(rawShares / lotSize) * lotSize;
}

export interface KellySizingInput {
  /** Historical win rate as a fraction in `(0, 1)`. */
  winRate: number;
  avgWin: number;
  /** Average loss as a positive number. */
  avgLoss: number;
  accountBalance: number;
  entryPrice: number;
  /** Fraction of full Kelly to deploy. Defaults to 0.5 (half-Kelly). */
  fraction?: number;
}

/**
 * Kelly criterion sizing, scaled by `fraction`.
 *
 * Full Kelly is famously over-aggressive against estimation error in the win
 * rate, which is why the default is half.
 */
export function kellySize(input: KellySizingInput): number {
  const { winRate, avgWin, avgLoss, accountBalance, entryPrice } = input;
  const fraction = input.fraction ?? 0.5;

  if (accountBalance <= 0 || entryPrice <= 0 || avgLoss === 0) {
    return 0;
  }

  if (winRate <= 0 || winRate >= 1) {
    return 0;
  }

  const payoff = avgWin / avgLoss;
  const kellyFraction = (payoff * winRate - (1 - winRate)) / payoff;

  if (kellyFraction <= 0) {
    return 0;
  }

  const riskAmount = accountBalance * kellyFraction * fraction;
  return Math.max(Math.floor(riskAmount / entryPrice), 0);
}

export interface VolatilitySizingInput {
  accountBalance: number;
  riskPercent: number;
  entryPrice: number;
  atr: number;
  /** ATR multiples between entry and stop. Defaults to 2. */
  atrMultiplier?: number;
  lotSize?: number;
}

/** Fixed-risk sizing where the stop distance comes from ATR. */
export function volatilitySize(input: VolatilitySizingInput): number {
  const { accountBalance, riskPercent, entryPrice, atr } = input;
  const atrMultiplier = input.atrMultiplier ?? 2;

  if (accountBalance <= 0 || entryPrice <= 0 || atr <= 0) {
    return 0;
  }

  return fixedRiskSize({
    accountBalance,
    riskPercent,
    entryPrice,
    stopLossPrice: entryPrice - atr * atrMultiplier,
    lotSize: input.lotSize,
  });
}

/** Stop a fixed percentage below entry. */
export function percentageStop(
  entryPrice: number,
  riskPercent: number,
): number {
  if (entryPrice <= 0 || riskPercent <= 0) {
    return 0;
  }

  return entryPrice * (1 - riskPercent / 100);
}

/** Stop `multiplier` ATRs below entry. */
export function atrStop(
  entryPrice: number,
  atr: number,
  multiplier = 2,
): number {
  if (entryPrice <= 0 || atr <= 0) {
    return 0;
  }

  return entryPrice - atr * multiplier;
}

/**
 * Stop just below the nearest support under entry. Returns 0 when no support
 * level sits below the entry price.
 */
export function supportStop(
  entryPrice: number,
  supportLevels: number[],
  buffer = 0.005,
): number {
  if (entryPrice <= 0 || supportLevels.length === 0) {
    return 0;
  }

  const below = supportLevels.filter((level) => level < entryPrice);
  if (below.length === 0) {
    return 0;
  }

  return Math.max(...below) * (1 - buffer);
}

/** Target at `riskRewardRatio` times the stop distance above entry. */
export function takeProfit(
  entryPrice: number,
  stopLossPrice: number,
  riskRewardRatio = 2,
): number {
  if (entryPrice <= 0 || stopLossPrice <= 0) {
    return 0;
  }

  return entryPrice + Math.abs(entryPrice - stopLossPrice) * riskRewardRatio;
}

export interface TrailUpdate {
  stop: number;
  highest: number;
  triggered: boolean;
}

/**
 * ATR trailing stop for a long position.
 *
 * The stop ratchets up with the high-water mark and never moves down, so a
 * pullback cannot loosen protection already earned.
 */
export class TrailManager {
  private currentStop: number;
  private highestPrice: number;

  constructor(
    public readonly entryPrice: number,
    public readonly initialStop: number,
    private readonly atr: number,
    private readonly trailMultiplier = 2,
  ) {
    this.currentStop = initialStop;
    this.highestPrice = entryPrice;
  }

  /** Feeds a new price in and returns the updated stop state. */
  public update(currentPrice: number): TrailUpdate {
    if (currentPrice <= 0) {
      return {
        stop: this.currentStop,
        highest: this.highestPrice,
        triggered: false,
      };
    }

    this.highestPrice = Math.max(this.highestPrice, currentPrice);

    const candidate = this.highestPrice - this.atr * this.trailMultiplier;
    if (candidate > this.currentStop) {
      this.currentStop = candidate;
    }

    return {
      stop: this.currentStop,
      highest: this.highestPrice,
      triggered: currentPrice <= this.currentStop,
    };
  }

  public get stop(): number {
    return this.currentStop;
  }

  public get highest(): number {
    return this.highestPrice;
  }

  public isTriggered(currentPrice: number): boolean {
    return currentPrice <= this.currentStop;
  }

  public profit(currentPrice: number): number {
    return currentPrice - this.entryPrice;
  }

  public profitPercent(currentPrice: number): number {
    if (this.entryPrice === 0) {
      return 0;
    }

    return Number(
      ((this.profit(currentPrice) / this.entryPrice) * 100).toFixed(2),
    );
  }
}
