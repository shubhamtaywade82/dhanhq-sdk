/**
 * Upstream drift check: compares the pinned openapi.json against the spec
 * Dhan serves live, so new or changed endpoints surface without an audit.
 *
 *   npm run upstream:drift                 # report; exit 1 on drift
 *   npm run upstream:drift -- --out f.md   # also write the report
 *   npm run upstream:drift -- --write      # re-pin openapi.json to the live spec
 *
 * Drift means the operation list or a parameter/body field changed, not
 * merely the bytes: the live document is re-serialized by the server.
 * Exit codes: 0 no drift, 1 drift found, 2 the check itself failed.
 */
import { createHash } from "crypto";
import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const SPEC_PATH = join(ROOT, "openapi.json");
const PIN_PATH = join(ROOT, "contracts", "openapi-pin.json");
export const LIVE_SPEC_URL = "https://api.dhan.co/v2/v3/api-docs";
const OFFICIAL_CLIENT_REPO = "dhan-oss/DhanHQ-py";
// The release notes page is plain MkDocs HTML; linked for review rather than
// parsed, since its layout is not a contract.
const RELEASE_NOTES_URL = "https://dhanhq.co/docs/v2/releases/";
const FETCH_TIMEOUT_MS = 30_000;
const HTTP_METHODS = ["get", "post", "put", "delete", "patch"];
// Sent on every call by the SDK's HTTP client; not part of an operation's contract.
const IGNORED_PARAMS = new Set(["access-token", "client-id"]);

export interface OpenApiSpec {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

interface OpenApiOperation {
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
  requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> };
}

interface OpenApiSchema {
  $ref?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface SpecDrift {
  added: string[];
  removed: string[];
  /** Operations whose parameter or request-body field names/required flags changed. */
  fieldsChanged: string[];
}

/** `METHOD /path` with path parameter names erased (`{order-id}` and `{orderId}` match). */
export function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, "{}").replace(/\/$/, "")}`;
}

function resolveSchema(spec: OpenApiSpec, schema: OpenApiSchema | undefined): OpenApiSchema | undefined {
  if (!schema?.$ref) return schema;
  return spec.components?.schemas?.[schema.$ref.replace("#/components/schemas/", "")];
}

function fieldSignature(spec: OpenApiSpec, operation: OpenApiOperation): string {
  const params = (operation.parameters ?? [])
    .filter((p) => !IGNORED_PARAMS.has(p.name))
    .map((p) => `${p.in}:${p.name}:${Boolean(p.required)}`);
  const body = resolveSchema(spec, operation.requestBody?.content?.["application/json"]?.schema);
  const required = new Set(body?.required ?? []);
  const fields = Object.keys(body?.properties ?? {}).map((name) => `body:${name}:${required.has(name)}`);
  return [...params, ...fields].sort().join(",");
}

/** Every operation in the spec, keyed by `operationKey`, valued by its field signature. */
export function operations(spec: OpenApiSpec): Map<string, string> {
  const result = new Map<string, string>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (HTTP_METHODS.includes(method)) result.set(operationKey(method, path), fieldSignature(spec, operation));
    }
  }
  return result;
}

/** Operations added, removed, or with changed fields between the pinned and live specs. */
export function diffSpecs(pinned: OpenApiSpec, live: OpenApiSpec): SpecDrift {
  const before = operations(pinned);
  const after = operations(live);
  return {
    added: [...after.keys()].filter((key) => !before.has(key)).sort(),
    removed: [...before.keys()].filter((key) => !after.has(key)).sort(),
    fieldsChanged: [...after].filter(([key, sig]) => before.has(key) && before.get(key) !== sig).map(([key]) => key).sort(),
  };
}

export function hasDrift(drift: SpecDrift): boolean {
  return drift.added.length + drift.removed.length + drift.fieldsChanged.length > 0;
}

/**
 * Conventional Commit type for the re-pin PR, which release-please turns into
 * the version bump: operation additions/removals change the regenerated
 * surface (minor); field-only drift is a fix (patch).
 */
export function releaseType(drift: SpecDrift): "feat" | "fix" {
  return drift.added.length + drift.removed.length > 0 ? "feat" : "fix";
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

function sectionLines(title: string, keys: string[]): string[] {
  return keys.length ? [`### ${title} (${keys.length})`, "", ...keys.map((key) => `- \`${key}\``), ""] : [];
}

async function officialClientCommits(since: string): Promise<string[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/repos/${OFFICIAL_CLIENT_REPO}/commits?per_page=30&since=${since}T00:00:00Z`;
  const commits = await fetchJson<Array<{ sha: string; html_url: string; commit: { message: string; committer: { date: string } } }>>(url, headers);
  return commits.map((c) => `- [\`${c.sha.slice(0, 7)}\`](${c.html_url}) ${c.commit.committer.date.slice(0, 10)} — ${c.commit.message.split("\n")[0]}`);
}

async function renderReport(drift: SpecDrift, pinnedAt: string): Promise<string> {
  const driftLines = hasDrift(drift)
    ? [...sectionLines("Added upstream", drift.added), ...sectionLines("Removed upstream", drift.removed), ...sectionLines("Fields changed", drift.fieldsChanged)]
    : ["No drift: the live spec's operations and fields match the pin.", ""];
  const commits = await officialClientCommits(pinnedAt);
  return [
    "## DhanHQ API drift",
    "",
    `Pinned \`openapi.json\` (${pinnedAt}) vs live ${LIVE_SPEC_URL}`,
    "",
    ...driftLines,
    "## Informational",
    "",
    `### \`${OFFICIAL_CLIENT_REPO}\` commits since ${pinnedAt}`,
    ...(commits.length ? commits : ["- none"]),
    "",
    `### Release notes to review by hand`,
    `- ${RELEASE_NOTES_URL}`,
    "",
  ].join("\n");
}

function writePin(liveText: string): void {
  const sha256 = createHash("sha256").update(liveText).digest("hex");
  const pinnedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(SPEC_PATH, liveText);
  writeFileSync(PIN_PATH, `${JSON.stringify({ source: LIVE_SPEC_URL, pinnedAt, sha256 }, null, 2)}\n`);
}

function argValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const pin = JSON.parse(readFileSync(PIN_PATH, "utf8")) as { pinnedAt: string };
  const live = await fetchJson<OpenApiSpec>(LIVE_SPEC_URL);
  const drift = diffSpecs(JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiSpec, live);
  const report = await renderReport(drift, pin.pinnedAt);
  console.log(report);
  const outPath = argValue(argv, "--out");
  if (outPath) writeFileSync(outPath, report);
  if (argv.includes("--write")) writePin(`${JSON.stringify(live, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `drifted=${hasDrift(drift)}\ntype=${releaseType(drift)}\n`);
  }
  if (hasDrift(drift)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error("upstream:drift FAILED:", error);
    process.exitCode = 2;
  });
}
