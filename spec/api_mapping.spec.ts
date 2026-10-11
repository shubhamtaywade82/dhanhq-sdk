import { readFileSync } from "fs";
import { join } from "path";

import { extractEndpoints, renderMapping } from "../scripts/gen-api-mapping";

describe("docs/API_MAPPING.md", () => {
  it("matches the resource classes (run `npm run docs:mapping` to update)", () => {
    const committed = readFileSync(join(__dirname, "..", "docs", "API_MAPPING.md"), "utf8");
    expect(committed).toBe(renderMapping());
  });

  it("finds every resource's requests", () => {
    const endpoints = extractEndpoints();
    const has = (verb: string, path: string) => endpoints.some((e) => e.verb === verb && e.path === path);

    expect(has("POST", "/orders")).toBe(true);
    expect(has("GET", "/trades/{fromDate}/{toDate}/{pageNumber}")).toBe(true);
    expect(has("POST", "/data/companyinfo")).toBe(true);
    expect(has("POST", "/globalstocks/orders")).toBe(true);
    expect(has("GET", "/instrument/{exchangeSegment}")).toBe(true);
    expect(endpoints.every((e) => !/[\s,]/.test(e.path))).toBe(true);
  });
});
