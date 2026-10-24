import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import { extractEndpoints } from "../scripts/gen-api-mapping";
import { operationKey, operations } from "../scripts/upstream-drift";

const ROOT = join(__dirname, "..");
const readJson = <T>(file: string): T => JSON.parse(readFileSync(join(ROOT, file), "utf8")) as T;

interface KnownGaps {
  specOnly: Array<{ operation: string; reason: string }>;
  sdkOnly: Array<{ operation: string; reason: string }>;
}

const gaps = readJson<KnownGaps>("contracts/known-gaps.json");
const specOps = new Set(operations(readJson("openapi.json")).keys());
const sdkOps = new Set(extractEndpoints().map((e) => operationKey(e.verb, e.path)));
const recordedSpecOnly = new Set(gaps.specOnly.map((g) => g.operation));
const recordedSdkOnly = new Set(gaps.sdkOnly.map((g) => g.operation));

describe("contracts/known-gaps.json", () => {
  it("records every spec operation the SDK does not implement", () => {
    const unrecorded = [...specOps].filter((op) => !sdkOps.has(op) && !recordedSpecOnly.has(op));
    expect(unrecorded).toEqual([]);
  });

  it("records every SDK call that Dhan's spec does not list", () => {
    const unrecorded = [...sdkOps].filter((op) => !specOps.has(op) && !recordedSdkOnly.has(op));
    expect(unrecorded).toEqual([]);
  });

  it("has no stale entries", () => {
    const staleSpecOnly = [...recordedSpecOnly].filter((op) => sdkOps.has(op) || !specOps.has(op));
    const staleSdkOnly = [...recordedSdkOnly].filter((op) => specOps.has(op) || !sdkOps.has(op));
    expect([...staleSpecOnly, ...staleSdkOnly]).toEqual([]);
  });

  it("gives every entry a reason", () => {
    for (const gap of [...gaps.specOnly, ...gaps.sdkOnly]) expect(gap.reason.trim()).not.toBe("");
  });
});

describe("contracts/openapi-pin.json", () => {
  it("matches the committed openapi.json", () => {
    const pin = readJson<{ sha256: string; pinnedAt: string }>("contracts/openapi-pin.json");
    const sha256 = createHash("sha256").update(readFileSync(join(ROOT, "openapi.json"))).digest("hex");
    expect(pin.sha256).toBe(sha256);
    expect(pin.pinnedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
