import {
  expiredOptionsDataSchema,
  historicalChartsSchema,
  intradayChartsSchema,
  optionChainRequestSchema,
} from "../src/contracts";
import { adjustTradingDateRange, getMarketSessionInfo } from "../src/ta/marketCalendar";

describe("Runtime contracts & date adjustment validation", () => {
  describe("intradayChartsSchema", () => {
    it("validates correct intraday chart requests", () => {
      const valid = intradayChartsSchema.safeParse({
        securityId: "1333",
        exchangeSegment: "NSE_EQ",
        instrument: "EQUITY",
        interval: 15,
        fromDate: "2026-07-01",
        toDate: "2026-07-28",
      });
      expect(valid.success).toBe(true);
    });

    it("allows same-date intraday chart requests (fromDate == toDate)", () => {
      const valid = intradayChartsSchema.safeParse({
        securityId: "1333",
        exchangeSegment: "NSE_EQ",
        instrument: "EQUITY",
        interval: 15,
        fromDate: "2026-07-28",
        toDate: "2026-07-28",
      });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid exchange segments", () => {
      const invalid = intradayChartsSchema.safeParse({
        securityId: "1333",
        exchangeSegment: "INVALID_SEG",
        instrument: "EQUITY",
        interval: 15,
      });
      expect(invalid.success).toBe(false);
    });

    it("rejects fromDate > toDate", () => {
      const invalid = intradayChartsSchema.safeParse({
        securityId: "1333",
        exchangeSegment: "NSE_EQ",
        instrument: "EQUITY",
        interval: 15,
        fromDate: "2026-07-28",
        toDate: "2026-07-01",
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0].message).toContain("must be <= toDate");
      }
    });

    it("rejects date range exceeding 90 days for intraday", () => {
      const invalid = intradayChartsSchema.safeParse({
        securityId: "1333",
        exchangeSegment: "NSE_EQ",
        instrument: "EQUITY",
        interval: 15,
        fromDate: "2026-01-01",
        toDate: "2026-06-01",
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0].message).toContain("exceeds maximum limit of 90 days");
      }
    });

    it("rejects future toDate beyond today in IST", () => {
      const invalid = intradayChartsSchema.safeParse({
        securityId: "1333",
        exchangeSegment: "NSE_EQ",
        instrument: "EQUITY",
        interval: 15,
        fromDate: "2026-07-01",
        toDate: "2099-01-01",
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0].message).toContain("cannot be in the future");
      }
    });
  });

  describe("expiredOptionsDataSchema", () => {
    it("validates correct expired options data requests", () => {
      const valid = expiredOptionsDataSchema.safeParse({
        securityId: 13,
        exchangeSegment: "NSE_FNO",
        instrument: "OPTIDX",
        expiryFlag: "WEEK",
        expiryCode: 1,
        strike: "ATM",
        drvOptionType: "CALL",
        interval: "15",
        fromDate: "2026-07-01",
        toDate: "2026-07-28",
      });
      expect(valid.success).toBe(true);

      const currentExpiry = expiredOptionsDataSchema.safeParse({
        securityId: 13,
        exchangeSegment: "NSE_FNO",
        instrument: "OPTIDX",
        expiryFlag: "WEEK",
        expiryCode: 0,
        strike: "ATM",
        drvOptionType: "CALL",
        fromDate: "2026-07-01",
        toDate: "2026-07-28",
      });
      expect(currentExpiry.success).toBe(true);

      const invalidExpiryCode = expiredOptionsDataSchema.safeParse({
        securityId: 13,
        exchangeSegment: "NSE_FNO",
        instrument: "OPTIDX",
        expiryFlag: "WEEK",
        expiryCode: 3,
        strike: "ATM",
        drvOptionType: "CALL",
        fromDate: "2026-07-01",
        toDate: "2026-07-28",
      });
      expect(invalidExpiryCode.success).toBe(false);
    });

    it("rejects missing instrument and instrumentType", () => {
      const invalid = expiredOptionsDataSchema.safeParse({
        securityId: 13,
        exchangeSegment: "NSE_FNO",
        expiryFlag: "WEEK",
        expiryCode: 1,
        strike: "ATM",
        drvOptionType: "CALL",
        fromDate: "2026-07-01",
        toDate: "2026-07-28",
      });
      expect(invalid.success).toBe(false);
    });

    it("rejects date range exceeding 30 calendar days for expired options", () => {
      const invalid = expiredOptionsDataSchema.safeParse({
        securityId: 13,
        exchangeSegment: "NSE_FNO",
        instrument: "OPTIDX",
        expiryFlag: "WEEK",
        expiryCode: 1,
        strike: "ATM",
        drvOptionType: "CALL",
        fromDate: "2025-01-01",
        toDate: "2025-02-02",
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0].message).toContain("maximum limit of 30 calendar days");
      }
    });
  });

  describe("adjustTradingDateRange", () => {
    it("adjusts weekend toDate to Friday (within 2-day threshold)", () => {
      // 2026-07-26 is a Sunday -> should shift to 2026-07-24 (Friday)
      const adjusted = adjustTradingDateRange({
        fromDate: "2026-07-20",
        toDate: "2026-07-26",
      }, { maxShiftDays: 2 });

      expect(adjusted.adjusted).toBe(true);
      expect(adjusted.toDate).toBe("2026-07-24");
      expect(adjusted.adjustments[0]).toContain("Adjusted toDate from non-trading day");
    });

    it("clamps date range exceeding maxDays", () => {
      const adjusted = adjustTradingDateRange({
        fromDate: "2026-01-01",
        toDate: "2026-06-01",
      }, { maxDays: 90, clampFuture: false });

      expect(adjusted.adjusted).toBe(true);
      expect(adjusted.adjustments.some((a) => a.includes("Clamped date range span"))).toBe(true);
    });

    it("auto-switches future toDate to latest active trading session date", () => {
      const adjusted = adjustTradingDateRange({
        fromDate: "2026-07-01",
        toDate: "2099-01-01",
      }, { clampFuture: true });

      expect(adjusted.adjusted).toBe(true);
      expect(adjusted.toDate).not.toBe("2099-01-01");
      expect(adjusted.adjustments[0]).toContain("Auto-switched toDate");
    });
  });

  describe("marketCalendar session info", () => {
    it("returns IST market session state accurately", () => {
      const session = getMarketSessionInfo();
      expect(session).toHaveProperty("istDate");
      expect(session).toHaveProperty("sessionState");
      expect(session).toHaveProperty("lastCompletedTradingDay");
      expect(["PRE_MARKET", "IN_SESSION", "POST_MARKET", "CLOSED"]).toContain(session.sessionState);
    });
  });
});
