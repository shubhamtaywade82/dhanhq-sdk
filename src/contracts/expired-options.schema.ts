import { z } from "zod";
import { fromDateString, toIstDateString } from "../ta/marketCalendar";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dayDifference(fromStr: string, toStr: string): number {
  const fromMs = fromDateString(fromStr).getTime();
  const toMs = fromDateString(toStr).getTime();
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

export const expiredOptionsDataSchema = z
  .object({
    securityId: z.string().min(1).or(z.number().positive().transform(String)),
    exchangeSegment: z.enum([
      "NSE_FNO",
      "BSE_FNO",
      "MCX_COMM",
      "IDX_I",
      "NSE_EQ",
    ]),
    instrument: z
      .enum(["INDEX", "OPTIDX", "OPTSTK", "EQUITY", "FUTIDX", "FUTSTK"])
      .optional(),
    instrumentType: z.enum(["INDEX", "STOCK"]).optional(),
    expiryFlag: z.enum(["WEEK", "MONTH", "WEEKLY", "MONTHLY"]),
    expiryCode: z.number().int().min(1).max(10),
    strike: z
      .string()
      .min(1, "strike is required (e.g. 'ATM', 'ATM+1', 'ATM-2')"),
    drvOptionType: z.enum(["CALL", "PUT"]),
    interval: z.enum(["1", "5", "15", "25", "60"]).optional(),
    requiredData: z.array(z.string()).optional(),
    fromDate: z
      .string()
      .regex(DATE_REGEX, "fromDate must be YYYY-MM-DD format"),
    toDate: z.string().regex(DATE_REGEX, "toDate must be YYYY-MM-DD format"),
  })
  .superRefine((val, ctx) => {
    const todayIst = toIstDateString();

    if (!val.instrument && !val.instrumentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either instrument or instrumentType must be provided",
        path: ["instrument"],
      });
    }

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
    if (diff > 180) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Expired options data range (${diff} days) exceeds maximum limit of 180 days`,
        path: ["toDate"],
      });
    }
  });
