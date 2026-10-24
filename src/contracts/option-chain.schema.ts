import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const optionChainRequestSchema = z.object({
  underlyingScrip: z
    .number()
    .positive("underlyingScrip must be a positive security ID"),
  underlyingSeg: z.enum(["IDX_I", "NSE_FNO", "BSE_FNO", "NSE_EQ"]),
  expiry: z.string().regex(DATE_REGEX, "expiry must be in YYYY-MM-DD format"),
});

export const optionChainExpiryListSchema = z.object({
  underlyingScrip: z
    .number()
    .positive("underlyingScrip must be a positive security ID"),
  underlyingSeg: z.enum(["IDX_I", "NSE_FNO", "BSE_FNO", "NSE_EQ"]),
});
