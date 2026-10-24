/**
 * Trading-day arithmetic and session awareness for the Indian equity market (NSE/BSE).
 *
 * Dates are handled as `YYYY-MM-DD` strings in IST so that a call made from a
 * machine in another timezone still resolves to the right trading session.
 */

const IST_OFFSET_MINUTES = 330;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * NSE trading holidays, as `YYYY-MM-DD`. Weekends are handled separately, so
 * only weekday holidays need listing. Extend this when the exchange publishes
 * the next calendar.
 */
export const MARKET_HOLIDAYS = new Set<string>([
  // 2025
  "2025-02-26",
  "2025-03-14",
  "2025-03-31",
  "2025-04-10",
  "2025-04-14",
  "2025-04-18",
  "2025-05-01",
  "2025-08-15",
  "2025-08-27",
  "2025-10-02",
  "2025-10-21",
  "2025-10-22",
  "2025-11-05",
  "2025-12-25",
  // 2026
  "2026-01-26",
  "2026-03-04",
  "2026-04-01",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-08-15",
  "2026-10-02",
  "2026-12-25",
]);

/** Formats a date as `YYYY-MM-DD` in IST. */
export function toIstDateString(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Parses `YYYY-MM-DD` as UTC midnight, which keeps day arithmetic exact. */
export function fromDateString(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(value: string, days: number): string {
  return new Date(fromDateString(value).getTime() + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export function isWeekday(value: string): boolean {
  const day = fromDateString(value).getUTCDay();
  return day >= 1 && day <= 5;
}

export function isTradingDay(value: string): boolean {
  return isWeekday(value) && !MARKET_HOLIDAYS.has(value);
}

/** `from` itself if it is a trading day, else the most recent one before it. */
export function lastTradingDay(from: string = toIstDateString()): string {
  let cursor = from;
  while (!isTradingDay(cursor)) {
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

/** The trading day strictly before `from`. */
export function previousTradingDay(from: string = toIstDateString()): string {
  return lastTradingDay(addDays(from, -1));
}

/** Today when the market trades today, otherwise the previous session. */
export function todayOrLastTradingDay(): string {
  return lastTradingDay(toIstDateString());
}

/** Walks back `days` trading sessions from `date`. */
export function tradingDaysAgo(date: string, days: number): string {
  if (days < 0) {
    throw new RangeError("days must be >= 0");
  }

  let cursor = isTradingDay(date) ? date : todayOrLastTradingDay();
  for (let count = 0; count < days; count += 1) {
    cursor = previousTradingDay(cursor);
  }

  return cursor;
}

export type MarketSessionState =
  "PRE_MARKET" | "IN_SESSION" | "POST_MARKET" | "CLOSED";

export interface MarketSessionInfo {
  istDate: string;
  istTime: string;
  isTradingDay: boolean;
  sessionState: MarketSessionState;
  lastCompletedTradingDay: string;
}

/**
 * Calculates current market session status in IST time.
 */
export function getMarketSessionInfo(
  now: Date = new Date(),
): MarketSessionInfo {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  const istDate = shifted.toISOString().slice(0, 10);
  const hours = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  const seconds = shifted.getUTCSeconds();

  const totalMinutes = hours * 60 + minutes;
  const istTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const tradingDay = isTradingDay(istDate);
  let sessionState: MarketSessionState = "CLOSED";

  if (tradingDay) {
    if (totalMinutes >= 540 && totalMinutes < 555) {
      sessionState = "PRE_MARKET";
    } else if (totalMinutes >= 555 && totalMinutes < 930) {
      sessionState = "IN_SESSION";
    } else if (totalMinutes >= 930 && totalMinutes < 960) {
      sessionState = "POST_MARKET";
    }
  }

  let lastCompletedTradingDay = istDate;
  if (!tradingDay || totalMinutes < 555) {
    lastCompletedTradingDay = previousTradingDay(istDate);
  }

  return {
    istDate,
    istTime,
    isTradingDay: tradingDay,
    sessionState,
    lastCompletedTradingDay,
  };
}

export interface DateRangeInput {
  fromDate?: string;
  toDate?: string;
}

export interface DateAdjustmentOptions {
  maxDays?: number; // e.g. 90 for intraday, 180 for expired options
  maxShiftDays?: number; // default 2 days threshold (e.g., Sat->Fri is 1 day, Sun->Fri is 2 days)
  clampFuture?: boolean; // default true
  adjustNonTradingDays?: boolean; // default true
}

export interface AdjustedDateRange {
  fromDate: string;
  toDate: string;
  originalFromDate?: string;
  originalToDate?: string;
  adjusted: boolean;
  adjustments: string[];
}

/**
 * Normalizes and adjusts a date range for market APIs:
 * - Clamps future dates to today's IST date.
 * - Shifts weekend/holiday `toDate` to the nearest previous trading day (within maxShiftDays threshold, default 2).
 * - Shifts weekend/holiday `fromDate` to the nearest trading day.
 * - Clamps `fromDate` if `toDate - fromDate` exceeds maxDays (e.g., 90 days for intraday).
 */
export function adjustTradingDateRange(
  input: DateRangeInput,
  options: DateAdjustmentOptions = {},
): AdjustedDateRange {
  const {
    maxDays = 90,
    maxShiftDays = 2,
    clampFuture = true,
    adjustNonTradingDays = true,
  } = options;

  const session = getMarketSessionInfo();
  const todayIst = session.istDate;

  let toDate = input.toDate ?? todayIst;
  let fromDate = input.fromDate ?? toDate;
  const originalFromDate = input.fromDate;
  const originalToDate = input.toDate;
  const adjustments: string[] = [];

  // 1. Clamp future/pre-market toDate to last completed trading day
  const maxAllowedToDate = session.lastCompletedTradingDay;
  if (clampFuture && toDate > maxAllowedToDate) {
    adjustments.push(
      `Auto-switched toDate from ${toDate} to latest active trading session date (${maxAllowedToDate})`,
    );
    toDate = maxAllowedToDate;
  }

  // 2. Adjust non-trading toDate (weekend / holiday) within maxShiftDays threshold
  if (adjustNonTradingDays && !isTradingDay(toDate)) {
    let candidate = toDate;
    let shiftCount = 0;
    while (!isTradingDay(candidate) && shiftCount < maxShiftDays) {
      candidate = addDays(candidate, -1);
      shiftCount += 1;
    }

    if (isTradingDay(candidate)) {
      adjustments.push(
        `Adjusted toDate from non-trading day ${toDate} to last trading day ${candidate} (-${shiftCount} day(s))`,
      );
      toDate = candidate;
    }
  }

  // 3. Adjust non-trading fromDate within maxShiftDays threshold
  if (adjustNonTradingDays && !isTradingDay(fromDate)) {
    let candidate = fromDate;
    let shiftCount = 0;
    while (!isTradingDay(candidate) && shiftCount < maxShiftDays) {
      candidate = addDays(candidate, 1);
      shiftCount += 1;
    }
    if (isTradingDay(candidate) && candidate <= toDate) {
      adjustments.push(
        `Adjusted fromDate from non-trading day ${fromDate} to trading day ${candidate} (+${shiftCount} day(s))`,
      );
      fromDate = candidate;
    }
  }

  // 4. Ensure fromDate <= toDate
  if (fromDate > toDate) {
    adjustments.push(
      `Adjusted fromDate (${fromDate}) to match toDate (${toDate})`,
    );
    fromDate = toDate;
  }

  // 5. Enforce maxDays span limit
  const msDiff =
    fromDateString(toDate).getTime() - fromDateString(fromDate).getTime();
  const daySpan = Math.round(msDiff / MS_PER_DAY);
  if (daySpan > maxDays) {
    const clampedFrom = addDays(toDate, -maxDays);
    adjustments.push(
      `Clamped date range span from ${daySpan} days to max ${maxDays} days (fromDate set to ${clampedFrom})`,
    );
    fromDate = clampedFrom;
  }

  return {
    fromDate,
    toDate,
    originalFromDate,
    originalToDate,
    adjusted: adjustments.length > 0,
    adjustments,
  };
}
