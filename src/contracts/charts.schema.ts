import { z } from "zod";
import {
  fromDateString,
  getMarketSessionInfo,
  toIstDateString,
} from "../ta/marketCalendar";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dayDifference(fromStr: string, toStr: string): number {
  const fromMs = fromDateString(fromStr).getTime();
  const toMs = fromDateString(toStr).getTime();
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

export const intradayChartsSchema = z
  .object({
    securityId: z.string().min(1, "securityId is required"),
    exchangeSegment: z.enum([
      "NSE_EQ",
      "NSE_FNO",
      "BSE_EQ",
      "BSE_FNO",
      "MCX_COMM",
      "IDX_I",
      "NSE_CURRENCY",
    ]),
    instrument: z.enum([
      "INDEX",
      "FUTIDX",
      "OPTIDX",
      "EQUITY",
      "FUTSTK",
      "OPTSTK",
      "FUTCOM",
      "OPTFUT",
    ]),
    interval: z
      .enum(["1", "5", "15", "25", "60"])
      .or(z.number().transform(String)),
    oi: z.boolean().optional(),
    fromDate: z
      .string()
      .regex(DATE_REGEX, "fromDate must be YYYY-MM-DD format")
      .optional(),
    toDate: z
      .string()
      .regex(DATE_REGEX, "toDate must be YYYY-MM-DD format")
      .optional(),
  })
  .superRefine((val, ctx) => {
    const todayIst = toIstDateString();

    if (val.fromDate && val.toDate) {
      if (val.fromDate > val.toDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `fromDate (${val.fromDate}) must be <= toDate (${val.toDate})`,
          path: ["fromDate"],
        });
      }

      if (val.toDate > todayIst) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `toDate (${val.toDate}) cannot be in the future (today in IST is ${todayIst})`,
          path: ["toDate"],
        });
      }

      const diff = dayDifference(val.fromDate, val.toDate);
      if (diff > 90) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Intraday chart date range (${diff} days) exceeds maximum limit of 90 days`,
          path: ["toDate"],
        });
      }

      const session = getMarketSessionInfo();
      if (val.toDate === todayIst && !session.isTradingDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `toDate (${val.toDate}) is today, but today is a non-trading day (weekend/holiday). Last active session was ${session.lastCompletedTradingDay}`,
          path: ["toDate"],
        });
      }
    }
  });

export const historicalChartsSchema = z
  .object({
    securityId: z.string().min(1, "securityId is required"),
    exchangeSegment: z.enum([
      "NSE_EQ",
      "NSE_FNO",
      "BSE_EQ",
      "BSE_FNO",
      "MCX_COMM",
      "IDX_I",
      "NSE_CURRENCY",
    ]),
    instrument: z.enum([
      "INDEX",
      "FUTIDX",
      "OPTIDX",
      "EQUITY",
      "FUTSTK",
      "OPTSTK",
      "FUTCOM",
      "OPTFUT",
    ]),
    fromDate: z
      .string()
      .regex(DATE_REGEX, "fromDate must be YYYY-MM-DD format"),
    toDate: z.string().regex(DATE_REGEX, "toDate must be YYYY-MM-DD format"),
  })
  .superRefine((val, ctx) => {
    const todayIst = toIstDateString();

    if (val.fromDate > val.toDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `fromDate (${val.fromDate}) must be <= toDate (${val.toDate})`,
        path: ["fromDate"],
      });
    }

    if (val.toDate > todayIst) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `toDate (${val.toDate}) cannot be in the future (today in IST is ${todayIst})`,
        path: ["toDate"],
      });
    }

    const diff = dayDifference(val.fromDate, val.toDate);
    if (diff > 3650) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Historical daily chart date range (${diff} days) exceeds maximum limit of 10 years (3650 days)`,
        path: ["toDate"],
      });
    }
  });
