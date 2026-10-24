import { z } from "zod";

export const orderSchema = z
  .object({
    dhanClientId: z.string().min(1).optional(),
    correlationId: z.string().min(1).max(128).optional(),
    transactionType: z.enum(["BUY", "SELL"]),
    exchangeSegment: z.enum([
      "NSE_EQ",
      "NSE_FNO",
      "NSE_COMM",
      "BSE_EQ",
      "BSE_FNO",
      "MCX_COMM",
    ]),
    productType: z.enum(["CNC", "INTRADAY", "MARGIN", "MTF", "BO", "CO"]),
    orderType: z.enum(["MARKET", "LIMIT", "STOP_LOSS", "STOP_LOSS_MARKET"]),
    validity: z.enum(["DAY", "IOC"]).optional(),
    quantity: z.number().int().positive(),
    disclosedQuantity: z.number().int().nonnegative().optional(),
    price: z.number().nonnegative().optional(),
    triggerPrice: z.number().nonnegative().optional(),
    afterMarketOrder: z.boolean().optional(),
    amoTime: z.string().min(1).optional(),
    securityId: z.string().min(1),
    boProfitValue: z.number().nonnegative().optional(),
    boStopLossValue: z.number().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.orderType === "LIMIT" || value.orderType === "STOP_LOSS") &&
      value.price === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "price is required for LIMIT and STOP_LOSS orders",
        path: ["price"],
      });
    }

    if (
      (value.orderType === "STOP_LOSS" ||
        value.orderType === "STOP_LOSS_MARKET") &&
      value.triggerPrice === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "triggerPrice is required for STOP_LOSS and STOP_LOSS_MARKET orders",
        path: ["triggerPrice"],
      });
    }
  });
