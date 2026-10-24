import {
  CHART_INTERVALS,
  EXCHANGE_SEGMENTS,
  GLOBAL_ORDER_TYPES,
  ORDER_TYPES,
  PRODUCT_TYPES,
  TRANSACTION_TYPES,
  VALIDITIES,
} from "../constants";
import type { SkillParam, SkillParamType } from "../skills/Skill";
import type { JsonSchema } from "./Tool";

/**
 * JSON Schema fragments describing what each agent tool accepts.
 *
 * Pure data — no API calls, no policy, no state. Kept apart from the catalogue
 * so adding an endpoint means editing a schema here and a handler there,
 * rather than growing one module that registers, describes and dispatches.
 */

export const emptySchema: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

function enumOf(values: readonly string[]): JsonSchema {
  return { type: "string", enum: [...values] };
}

export const searchSchema: JsonSchema = {
  type: "object",
  required: ["query"],
  properties: {
    query: {
      type: "string",
      description: "Symbol or partial symbol to resolve",
    },
    segments: {
      type: "array",
      items: enumOf(EXCHANGE_SEGMENTS),
      description: "Segments to search, in order",
    },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    exactMatch: { type: "boolean" },
  },
  additionalProperties: false,
};

export const feedSchema: JsonSchema = {
  type: "object",
  required: ["instruments"],
  properties: {
    instruments: {
      type: "object",
      description:
        'Security ids keyed by exchange segment, e.g. { "NSE_EQ": [11536] }',
      additionalProperties: {
        type: "array",
        items: { type: ["integer", "string"] },
      },
    },
  },
  additionalProperties: false,
};

export const orderSchema: JsonSchema = {
  type: "object",
  required: [
    "transactionType",
    "exchangeSegment",
    "productType",
    "orderType",
    "securityId",
    "quantity",
  ],
  properties: {
    transactionType: enumOf(TRANSACTION_TYPES),
    exchangeSegment: enumOf(EXCHANGE_SEGMENTS),
    productType: enumOf(PRODUCT_TYPES),
    orderType: enumOf(ORDER_TYPES),
    validity: enumOf(VALIDITIES),
    securityId: { type: "string" },
    quantity: { type: "integer", minimum: 1 },
    disclosedQuantity: { type: "integer", minimum: 0 },
    price: { type: "number", minimum: 0 },
    triggerPrice: { type: "number", minimum: 0 },
    correlationId: { type: "string" },
  },
  additionalProperties: true,
};

export const modifyOrderSchema: JsonSchema = {
  type: "object",
  required: ["orderId"],
  properties: {
    orderId: { type: "string" },
    orderType: enumOf(ORDER_TYPES),
    validity: enumOf(VALIDITIES),
    quantity: { type: "integer", minimum: 1 },
    disclosedQuantity: { type: "integer", minimum: 0 },
    price: { type: "number", minimum: 0 },
    triggerPrice: { type: "number", minimum: 0 },
  },
  additionalProperties: false,
};

export const cancelSchema: JsonSchema = {
  type: "object",
  required: ["orderId"],
  properties: { orderId: { type: "string" } },
  additionalProperties: false,
};

export const optionChainSchema: JsonSchema = {
  type: "object",
  required: ["underlyingScrip", "underlyingSeg", "expiry"],
  properties: {
    underlyingScrip: { type: "integer" },
    underlyingSeg: enumOf(["IDX_I", "NSE_EQ", "NSE_FNO", "BSE_EQ"]),
    expiry: { type: "string", description: "Expiry date as YYYY-MM-DD" },
  },
  additionalProperties: false,
};

export const expiryListSchema: JsonSchema = {
  type: "object",
  required: ["underlyingScrip", "underlyingSeg"],
  properties: {
    underlyingScrip: { type: "integer" },
    underlyingSeg: enumOf(["IDX_I", "NSE_EQ", "NSE_FNO", "BSE_EQ"]),
  },
  additionalProperties: false,
};

export const historicalSchema: JsonSchema = {
  type: "object",
  required: ["securityId", "exchangeSegment", "instrument"],
  properties: {
    securityId: { type: "string" },
    exchangeSegment: enumOf(EXCHANGE_SEGMENTS),
    instrument: { type: "string" },
    fromDate: { type: "string" },
    toDate: { type: "string" },
    oi: { type: "boolean" },
  },
  additionalProperties: false,
};

export const intradaySchema: JsonSchema = {
  type: "object",
  required: ["securityId", "exchangeSegment", "instrument"],
  properties: {
    securityId: { type: "string" },
    exchangeSegment: enumOf(EXCHANGE_SEGMENTS),
    instrument: { type: "string" },
    interval: enumOf(CHART_INTERVALS),
    fromDate: { type: "string" },
    toDate: { type: "string" },
    oi: { type: "boolean" },
    autoAdjustDates: { type: "boolean" },
  },
  additionalProperties: false,
};

export const expiredOptionsSchema: JsonSchema = {
  type: "object",
  required: [
    "securityId",
    "exchangeSegment",
    "expiryFlag",
    "expiryCode",
    "strike",
    "drvOptionType",
    "fromDate",
    "toDate",
  ],
  properties: {
    securityId: { type: ["string", "integer"] },
    exchangeSegment: enumOf([
      "NSE_FNO",
      "BSE_FNO",
      "MCX_COMM",
      "IDX_I",
      "NSE_EQ",
    ]),
    instrument: enumOf(["INDEX", "OPTIDX", "OPTSTK", "EQUITY"]),
    instrumentType: enumOf(["INDEX", "STOCK"]),
    expiryFlag: enumOf(["WEEK", "MONTH", "WEEKLY", "MONTHLY"]),
    expiryCode: { type: "integer", minimum: 1, maximum: 10 },
    strike: { type: "string", description: "e.g. ATM, ATM+1, ATM-2" },
    drvOptionType: enumOf(["CALL", "PUT"]),
    interval: enumOf(["1", "5", "15", "25", "60"]),
    fromDate: { type: "string", description: "YYYY-MM-DD" },
    toDate: { type: "string", description: "YYYY-MM-DD" },
    autoAdjustDates: { type: "boolean" },
  },
  additionalProperties: false,
};

export const technicalsSchema: JsonSchema = {
  type: "object",
  required: ["securityId", "exchangeSegment", "instrument"],
  properties: {
    securityId: { type: "string" },
    exchangeSegment: enumOf(EXCHANGE_SEGMENTS),
    instrument: { type: "string" },
    intervals: {
      type: "array",
      items: { type: "integer", enum: [1, 5, 15, 25, 60] },
    },
    daysBack: { type: "integer", minimum: 1 },
  },
  additionalProperties: false,
};

export const marginSchema: JsonSchema = {
  type: "object",
  required: [
    "transactionType",
    "exchangeSegment",
    "productType",
    "securityId",
    "quantity",
  ],
  properties: {
    transactionType: enumOf(TRANSACTION_TYPES),
    exchangeSegment: enumOf(EXCHANGE_SEGMENTS),
    productType: enumOf(PRODUCT_TYPES),
    securityId: { type: "string" },
    quantity: { type: "integer", minimum: 1 },
    price: { type: "number", minimum: 0 },
    triggerPrice: { type: "number", minimum: 0 },
  },
  additionalProperties: true,
};

const SKILL_PARAM_TYPES: Record<SkillParamType, string> = {
  string: "string",
  integer: "integer",
  number: "number",
  boolean: "boolean",
};

/** Turns a skill's parameter declarations into an input schema. */
export function skillInputSchema(
  params: Record<string, SkillParam>,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [name, config] of Object.entries(params)) {
    properties[name] = { type: SKILL_PARAM_TYPES[config.type] ?? "string" };

    if (config.description) {
      properties[name].description = config.description;
    }

    if (config.default !== undefined) {
      properties[name].default = config.default;
    }

    if (config.required) {
      required.push(name);
    }
  }

  return { type: "object", properties, required, additionalProperties: false };
}

/* --- Global Stocks (US equities) --- */

export const globalOrderSchema: JsonSchema = {
  type: "object",
  required: ["transactionType", "orderType", "securityId"],
  properties: {
    transactionType: enumOf(TRANSACTION_TYPES),
    orderType: enumOf(GLOBAL_ORDER_TYPES),
    securityId: { type: "string" },
    quantity: {
      type: "number",
      exclusiveMinimum: 0,
      description:
        "Fractional shares allowed. Required unless orderType is AMOUNT",
    },
    price: { type: "number", minimum: 0 },
    triggerPrice: { type: "number", exclusiveMinimum: 0 },
    stopLossPrice: { type: "number", exclusiveMinimum: 0 },
    targetPrice: { type: "number", exclusiveMinimum: 0 },
    amount: {
      type: "number",
      exclusiveMinimum: 0,
      description: "Dollar value for AMOUNT orders",
    },
    correlationId: { type: "string", maxLength: 30 },
  },
  additionalProperties: true,
};

export const globalEstimateToolSchema: JsonSchema = {
  type: "object",
  required: ["securityId", "transactionType", "price", "quantity"],
  properties: {
    securityId: { type: "string" },
    transactionType: enumOf(TRANSACTION_TYPES),
    price: { type: "number", minimum: 0 },
    quantity: { type: "number", exclusiveMinimum: 0 },
  },
  additionalProperties: false,
};

/* --- Trader controls --- */

export const killSwitchSchema: JsonSchema = {
  type: "object",
  required: ["killSwitchStatus"],
  properties: {
    killSwitchStatus: enumOf(["ACTIVATE", "DEACTIVATE"]),
  },
  additionalProperties: false,
};

export const pnlExitSchema: JsonSchema = {
  type: "object",
  properties: {
    profitValue: {
      type: "number",
      description: "Square off all positions once profit reaches this amount",
    },
    lossValue: {
      type: "number",
      description: "Square off all positions once loss reaches this amount",
    },
    enableKillSwitch: {
      type: "boolean",
      description:
        "Also trip the kill switch, blocking re-entry after the exit",
    },
    productType: {
      type: "array",
      items: enumOf(["INTRADAY", "DELIVERY"]),
    },
  },
  additionalProperties: false,
};
