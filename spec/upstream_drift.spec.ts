import { diffSpecs, hasDrift, operationKey, releaseType, type OpenApiSpec } from "../scripts/upstream-drift";

function spec(paths: OpenApiSpec["paths"], schemas = {}): OpenApiSpec {
  return { paths, components: { schemas } };
}

const token = { name: "access-token", in: "header", required: true };

describe("operationKey", () => {
  it("erases path parameter names", () => {
    expect(operationKey("get", "/orders/{order-id}")).toBe(operationKey("GET", "/orders/{orderId}"));
  });
});

describe("diffSpecs", () => {
  it("reports no drift for identical specs", () => {
    const pinned = spec({ "/orders": { get: { parameters: [token] } } });
    expect(hasDrift(diffSpecs(pinned, pinned))).toBe(false);
  });

  it("reports added and removed operations", () => {
    const drift = diffSpecs(spec({ "/old": { get: {} } }), spec({ "/new": { post: {} } }));
    expect(drift).toEqual({ added: ["POST /new"], removed: ["GET /old"], fieldsChanged: [] });
  });

  it("reports a changed request-body field through a $ref", () => {
    const body = { content: { "application/json": { schema: { $ref: "#/components/schemas/Req" } } } };
    const pinned = spec({ "/orders": { post: { requestBody: body } } }, { Req: { properties: { qty: {} } } });
    const live = spec({ "/orders": { post: { requestBody: body } } }, { Req: { properties: { qty: {} }, required: ["qty"] } });
    expect(diffSpecs(pinned, live).fieldsChanged).toEqual(["POST /orders"]);
  });

  it("ignores the access-token header", () => {
    const drift = diffSpecs(spec({ "/a": { get: {} } }), spec({ "/a": { get: { parameters: [token] } } }));
    expect(hasDrift(drift)).toBe(false);
  });
});

describe("releaseType", () => {
  it("is feat when operations are added or removed", () => {
    expect(releaseType({ added: ["GET /a"], removed: [], fieldsChanged: [] })).toBe("feat");
  });

  it("is fix when only fields changed", () => {
    expect(releaseType({ added: [], removed: [], fieldsChanged: ["GET /a"] })).toBe("fix");
  });
});
