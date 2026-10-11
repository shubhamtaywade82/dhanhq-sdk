import type { AxiosInstance } from "axios";

import {
  Alerts,
  Charts,
  ConditionalTriggers,
  Edis,
  ForeverOrders,
  Funds,
  HttpClient,
  MarginCalculator,
  Positions,
} from "../src";

function createAxiosStub() {
  const requests: Array<{ method?: string; url?: string; data?: unknown }> = [];
  const queue: Array<() => Promise<{ data: unknown }>> = [];

  const axiosInstance = {
    request: jest.fn(async (config) => {
      requests.push(config);
      const next = queue.shift();
      if (!next) {
        throw new Error("No response queued");
      }
      return next();
    }),
  } as unknown as AxiosInstance;

  return {
    axiosInstance,
    requests,
    enqueueSuccess(data: unknown) {
      queue.push(async () => ({ data }));
    },
  };
}

function createHttpClient(axiosInstance: AxiosInstance) {
  return new HttpClient({ clientId: "client-id", token: "token" }, { axiosInstance });
}

describe("ForeverOrders — plain string-literal request shape", () => {
  it("sends plain string literals straight through as the JSON body", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ orderId: "gtt-1", orderStatus: "PENDING" });
    const foreverOrders = new ForeverOrders(createHttpClient(stub.axiosInstance));

    await foreverOrders.place({
      transactionType: "BUY",
      exchangeSegment: "NSE_EQ",
      productType: "CNC",
      orderType: "LIMIT",
      securityId: "1333",
      quantity: 10,
      price: 1450,
      triggerPrice: 1460,
    });

    expect(stub.requests[0]).toMatchObject({
      method: "POST",
      url: "/forever/orders",
      data: {
        transactionType: "BUY",
        exchangeSegment: "NSE_EQ",
        productType: "CNC",
        orderType: "LIMIT",
        securityId: "1333",
        quantity: 10,
        price: 1450,
        triggerPrice: 1460,
      },
    });
  });

  it("modify() also accepts plain string literals", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ orderId: "gtt-1", orderStatus: "PENDING" });
    const foreverOrders = new ForeverOrders(createHttpClient(stub.axiosInstance));

    await foreverOrders.modify("gtt-1", { orderType: "MARKET", legName: "TARGET_LEG" });

    expect(stub.requests[0]).toMatchObject({
      method: "PUT",
      url: "/forever/orders/gtt-1",
      data: { orderType: "MARKET", legName: "TARGET_LEG" },
    });
  });
});

describe("ConditionalTriggers — plain string-literal request shape", () => {
  it("place() sends a plain-string condition and orders array", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ alertId: "alert-1" });
    const triggers = new ConditionalTriggers(createHttpClient(stub.axiosInstance));

    await triggers.place({
      dhanClientId: "client-1",
      condition: {
        comparisonType: "PRICE_WITH_VALUE",
        exchangeSegment: "IDX_I",
        securityId: "1333",
        operator: "GREATER_THAN",
        comparingValue: 24500,
        frequency: "ONCE",
      },
      orders: [
        {
          transactionType: "BUY",
          exchangeSegment: "NSE_FNO",
          productType: "INTRADAY",
          orderType: "MARKET",
          validity: "DAY",
          securityId: "44000",
          quantity: 50,
        },
      ],
    });

    expect(stub.requests[0]).toMatchObject({
      method: "POST",
      url: "/alerts/orders",
      data: {
        dhanClientId: "client-1",
        condition: expect.objectContaining({
          comparisonType: "PRICE_WITH_VALUE",
          exchangeSegment: "IDX_I",
          operator: "GREATER_THAN",
        }),
        orders: [expect.objectContaining({ transactionType: "BUY", quantity: 50 })],
      },
    });
  });

  it("buildPriceCondition produces a plain-string condition object, no enum casting needed", () => {
    const condition = ConditionalTriggers.buildPriceCondition({
      exchangeSegment: "IDX_I",
      securityId: "1333",
      triggerAbove: 24500,
    });

    expect(condition).toEqual({
      comparisonType: "PRICE_WITH_VALUE",
      exchangeSegment: "IDX_I",
      securityId: "1333",
      operator: "GREATER_THAN",
      comparingValue: 24500,
      frequency: "ONCE",
    });
  });

  it("buildTechnicalCondition produces a plain-string condition object", () => {
    const condition = ConditionalTriggers.buildTechnicalCondition({
      exchangeSegment: "NSE_EQ",
      securityId: "26009",
      indicatorName: "RSI_14",
      timeFrame: "FIFTEEN_MIN",
      crossingAbove: 30,
    });

    expect(condition).toEqual({
      comparisonType: "TECHNICAL_WITH_VALUE",
      exchangeSegment: "NSE_EQ",
      securityId: "26009",
      indicatorName: "RSI_14",
      timeFrame: "FIFTEEN_MIN",
      operator: "CROSSING_UP",
      comparingValue: 30,
      frequency: "ONCE",
    });
  });
});

describe("Edis — plain string-literal request shape", () => {
  it("form() sends plain string literals for exchange/segment", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ status: "SUCCESS" });
    const edis = new Edis(createHttpClient(stub.axiosInstance));

    await edis.form({
      isin: "INE002A01018",
      qty: 10,
      exchange: "NSE",
      segment: "EQ",
      bulk: false,
    });

    expect(stub.requests[0]).toMatchObject({
      method: "POST",
      url: "/edis/form",
      data: { isin: "INE002A01018", qty: 10, exchange: "NSE", segment: "EQ", bulk: false },
    });
  });

  it("bulkForm() accepts an array of ISINs with plain string literals", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ status: "SUCCESS" });
    const edis = new Edis(createHttpClient(stub.axiosInstance));

    await edis.bulkForm({
      isin: ["INE002A01018", "INE009A01021"],
      exchange: "NSE",
      segment: "EQ",
    });

    expect(stub.requests[0]).toMatchObject({
      method: "POST",
      url: "/edis/bulkform",
      data: { isin: ["INE002A01018", "INE009A01021"], exchange: "NSE", segment: "EQ" },
    });
  });
});

describe("Alerts — plain string-literal request shape", () => {
  it("place() sends string-literal condition and order parameters", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ alertId: "alt-1" });
    const alerts = new Alerts(createHttpClient(stub.axiosInstance));

    await alerts.place({
      dhanClientId: "c-1",
      condition: {
        comparisonType: "PRICE_WITH_VALUE",
        exchangeSegment: "NSE_EQ",
        securityId: "1333",
        operator: "GREATER_THAN",
        comparingValue: 1500,
        frequency: "ONCE",
      },
      orders: [
        {
          transactionType: "BUY",
          exchangeSegment: "NSE_EQ",
          productType: "CNC",
          orderType: "MARKET",
          validity: "DAY",
          securityId: "1333",
          quantity: 1,
        },
      ],
    });

    expect(stub.requests[0]).toMatchObject({
      method: "POST",
      url: "/alerts/orders",
      data: { dhanClientId: "c-1" },
    });
  });
});

describe("Charts — plain string-literal request shape", () => {
  it("intraday() and historical() accept plain string literals", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ open: [100], high: [105], low: [99], close: [102] });
    stub.enqueueSuccess({ open: [100], high: [105], low: [99], close: [102] });
    const charts = new Charts(createHttpClient(stub.axiosInstance));

    await charts.intraday({
      exchangeSegment: "NSE_EQ",
      instrument: "EQUITY",
      interval: "1",
      securityId: "1333",
      fromDate: "2026-01-01",
      toDate: "2026-01-01",
      autoAdjustDates: false,
    });

    await charts.historical({
      exchangeSegment: "NSE_EQ",
      instrument: "EQUITY",
      expiryCode: 0,
      securityId: "1333",
      fromDate: "2025-01-01",
      toDate: "2025-12-31",
      autoAdjustDates: false,
    });

    expect(stub.requests[0].data).toMatchObject({
      exchangeSegment: "NSE_EQ",
      instrument: "EQUITY",
      interval: "1",
    });
    expect(stub.requests[1].data).toMatchObject({
      exchangeSegment: "NSE_EQ",
      instrument: "EQUITY",
    });
  });
});

describe("Funds & MarginCalculator — plain string-literal request shape", () => {
  it("Funds.calculateMargin() accepts string literals", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ totalMargin: 10000 });
    const funds = new Funds(createHttpClient(stub.axiosInstance));

    await funds.calculateMargin({
      exchangeSegment: "NSE_FNO",
      transactionType: "BUY",
      productType: "INTRADAY",
      securityId: "44000",
      quantity: 50,
      price: 150,
    });

    expect(stub.requests[0].data).toMatchObject({
      exchangeSegment: "NSE_FNO",
      transactionType: "BUY",
      productType: "INTRADAY",
    });
  });

  it("MarginCalculator.calculateSingle() and calculateMulti() accept string literals", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ totalMargin: 20000 });
    stub.enqueueSuccess({ totalMargin: 15000 });
    const mc = new MarginCalculator(createHttpClient(stub.axiosInstance));

    await mc.calculateSingle({
      exchangeSegment: "NSE_FNO",
      transactionType: "BUY",
      productType: "INTRADAY",
      securityId: "44000",
      quantity: 50,
      price: 150,
    });

    await mc.bullCallSpread({
      longStrikeSecurityId: "44000",
      shortStrikeSecurityId: "44050",
      quantity: 50,
      longPrice: 150,
      shortPrice: 100,
      productType: "INTRADAY",
    });

    // Single goes to /margincalculator as a flat order; the multi-leg helpers
    // need /margincalculator/multi, the only endpoint that reads scripList.
    expect(stub.requests[0].url).toBe("/margincalculator");
    expect(stub.requests[0].data).toMatchObject({ exchangeSegment: "NSE_FNO", transactionType: "BUY" });
    expect(stub.requests[0].data).not.toHaveProperty("scripList");
    expect(stub.requests[1].url).toBe("/margincalculator/multi");
    expect(stub.requests[1].data).toMatchObject({
      scripList: [
        { exchangeSegment: "NSE_FNO", transactionType: "BUY" },
        { exchangeSegment: "NSE_FNO", transactionType: "SELL" },
      ],
    });
  });
});

describe("Positions — plain string-literal request shape", () => {
  it("convert() accepts plain string literals for position types", async () => {
    const stub = createAxiosStub();
    stub.enqueueSuccess({ status: "SUCCESS" });
    const positions = new Positions(createHttpClient(stub.axiosInstance));

    await positions.convert({
      fromProductType: "INTRADAY",
      exchangeSegment: "NSE_EQ",
      positionType: "LONG",
      securityId: "1333",
      convertQty: 10,
      toProductType: "CNC",
    });

    expect(stub.requests[0]).toMatchObject({
      method: "POST",
      url: "/positions/convert",
      data: {
        fromProductType: "INTRADAY",
        exchangeSegment: "NSE_EQ",
        positionType: "LONG",
        toProductType: "CNC",
      },
    });
  });
});

