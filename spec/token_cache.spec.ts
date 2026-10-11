import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { AxiosError, type AxiosInstance } from "axios";

import {
  AuthenticationError,
  DhanAuth,
  DhanClient,
  FileTokenStore,
  MemoryTokenStore,
  TokenManager,
  TokenResponse,
} from "../src";

const CLIENT_ID = "1000000001";
const FAR_FUTURE = "2030-01-01T09:30:00";

function payload(accessToken: string, expiryTime = FAR_FUTURE) {
  return { dhanClientId: CLIENT_ID, accessToken, expiryTime };
}

/** Expiry string (IST, as Dhan sends it) `ms` from now. */
function istIn(ms: number): string {
  return new Date(Date.now() + ms + 330 * 60_000).toISOString().slice(0, 19);
}

let issued = 0;
function mockBroker() {
  issued = 0;
  const generate = jest
    .spyOn(DhanAuth, "generateAccessToken")
    .mockImplementation(async () => new TokenResponse(payload(`fresh-${++issued}`)));
  const renew = jest
    .spyOn(DhanAuth, "renewWebToken")
    .mockImplementation(async () => new TokenResponse(payload(`renewed-${++issued}`)));
  return { generate, renew };
}

function manager(store: MemoryTokenStore | FileTokenStore, extra: Record<string, unknown> = {}) {
  const config = { clientId: CLIENT_ID } as { clientId: string; token?: string };
  const tokenManager = new TokenManager(config, {
    clientId: CLIENT_ID,
    pin: "1234",
    totpSecret: "JBSWY3DPEHPK3PXP",
    store,
    ...extra,
  });
  return { config, tokenManager };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dhan-token-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe("FileTokenStore", () => {
  it("round-trips a token in a private file", async () => {
    const store = new FileTokenStore({ directory: join(dir, "cache") });

    await store.save(CLIENT_ID, payload("abc"));

    expect(await store.load(CLIENT_ID)).toEqual(payload("abc"));
    expect(statSync(store.pathFor(CLIENT_ID)).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "cache")).mode & 0o777).toBe(0o700);
  });

  it("reads a missing, corrupt or foreign file as no token", async () => {
    const store = new FileTokenStore({ directory: dir });
    expect(await store.load(CLIENT_ID)).toBeUndefined();

    writeFileSync(store.pathFor(CLIENT_ID), "{not json");
    expect(await store.load(CLIENT_ID)).toBeUndefined();

    writeFileSync(store.pathFor(CLIENT_ID), JSON.stringify({ clientId: "999", token: payload("x") }));
    expect(await store.load(CLIENT_ID)).toBeUndefined();
  });

  it("clears the file and refuses path-like client ids", async () => {
    const store = new FileTokenStore({ directory: dir });
    await store.save(CLIENT_ID, payload("abc"));

    await store.clear(CLIENT_ID);

    expect(await store.load(CLIENT_ID)).toBeUndefined();
    expect(() => store.pathFor("../etc/passwd")).toThrow(/unsafe client id/);
  });
});

describe("TokenManager with a store", () => {
  it("reuses a valid stored token without logging in", async () => {
    const { generate, renew } = mockBroker();
    const store = new MemoryTokenStore();
    store.save(CLIENT_ID, payload("cached"));
    const { config, tokenManager } = manager(store);

    expect(await tokenManager.ensureValidToken()).toBe("cached");
    expect(config.token).toBe("cached");
    expect(generate).not.toHaveBeenCalled();
    expect(renew).not.toHaveBeenCalled();
  });

  it("logs in and saves when the stored token has expired", async () => {
    const { generate } = mockBroker();
    const store = new MemoryTokenStore();
    store.save(CLIENT_ID, payload("old", "2020-01-01T09:30:00"));
    const { tokenManager } = manager(store);

    expect(await tokenManager.ensureValidToken()).toBe("fresh-1");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(store.load(CLIENT_ID)?.accessToken).toBe("fresh-1");
  });

  it("renews a stored token that is about to expire", async () => {
    const { generate, renew } = mockBroker();
    const store = new MemoryTokenStore();
    store.save(CLIENT_ID, payload("expiring", istIn(60_000)));
    const { tokenManager } = manager(store);

    expect(await tokenManager.ensureValidToken()).toBe("renewed-1");
    expect(renew).toHaveBeenCalledWith(expect.objectContaining({ token: "expiring" }));
    expect(generate).not.toHaveBeenCalled();
  });

  it("persists across manager instances through the file store", async () => {
    const { generate } = mockBroker();
    const store = new FileTokenStore({ directory: dir });

    await manager(store).tokenManager.ensureValidToken();
    const second = await manager(store).tokenManager.ensureValidToken();

    expect(second).toBe("fresh-1");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(store.pathFor(CLIENT_ID), "utf8")).token.accessToken).toBe("fresh-1");
  });

  it("still serves the token when the store fails", async () => {
    mockBroker();
    const errors: unknown[] = [];
    const broken = {
      load: () => {
        throw new Error("disk gone");
      },
      save: () => {
        throw new Error("read-only");
      },
      clear: () => undefined,
    };
    const { tokenManager } = manager(broken as never, { onStoreError: (e: unknown) => errors.push(e) });

    expect(await tokenManager.ensureValidToken()).toBe("fresh-1");
    expect(errors.map((e) => (e as Error).message)).toEqual(["disk gone", "read-only"]);
  });

  it("drops a rejected stored token after a 401 and logs in again", async () => {
    const { generate } = mockBroker();
    const store = new MemoryTokenStore();
    store.save(CLIENT_ID, payload("revoked"));
    const { tokenManager } = manager(store);
    await tokenManager.ensureValidToken();

    await tokenManager.handleUnauthorized();

    expect(generate).toHaveBeenCalledTimes(1);
    expect(tokenManager.getToken()?.accessToken).toBe("fresh-1");
    expect(store.load(CLIENT_ID)?.accessToken).toBe("fresh-1");
  });

  it("does not log in again when a just-issued token is rejected", async () => {
    const { generate } = mockBroker();
    const { tokenManager } = manager(new MemoryTokenStore());
    await tokenManager.ensureValidToken();

    await tokenManager.handleUnauthorized();

    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("DhanClient token wiring", () => {
  function urlOf(client: DhanClient): Promise<string> {
    return (client.ws.market as unknown as { urlFactory: () => Promise<string> }).urlFactory();
  }

  it("gives WebSockets the managed token, not the startup value", async () => {
    mockBroker();
    const client = new DhanClient({ clientId: CLIENT_ID });
    client.auth.enableAutoTokenManagement({
      clientId: CLIENT_ID,
      pin: "1234",
      totpSecret: "JBSWY3DPEHPK3PXP",
      store: new MemoryTokenStore(),
    });

    expect(await urlOf(client)).toContain("token=fresh-1");
    const orders = client.ws.orders as unknown as { authResolver: { resolveAccessToken(): Promise<string> } };
    expect(await orders.authResolver.resolveAccessToken()).toBe("fresh-1");
  });

  it("gives WebSockets a token changed after construction", async () => {
    const client = new DhanClient({ clientId: CLIENT_ID, token: "first" });
    client.getConfig().token = "second";

    expect(await urlOf(client)).toContain("token=second");
  });

  it("logs in again and replays a safe read after a 401", async () => {
    const { generate } = mockBroker();
    const seen: string[] = [];
    const axiosInstance = {
      request: jest.fn(async (config: { headers: Record<string, string> }) => {
        seen.push(config.headers["access-token"]);
        if (seen.length === 1) {
          throw new AxiosError("status 401", "ERR_BAD_REQUEST", undefined, {}, {
            status: 401,
            data: { errorCode: "DH-901", errorMessage: "Invalid token" },
          } as never);
        }
        return { data: [] };
      }),
    } as unknown as AxiosInstance;
    const client = new DhanClient({ clientId: CLIENT_ID }, { axiosInstance, circuitBreaker: false });
    const store = new MemoryTokenStore();
    store.save(CLIENT_ID, payload("revoked"));
    client.auth.enableAutoTokenManagement({ clientId: CLIENT_ID, pin: "1234", totpSecret: "JBSWY3DPEHPK3PXP", store });

    await client.orders.list();

    expect(seen).toEqual(["revoked", "fresh-1"]);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("refuses PIN/TOTP management in sandbox mode", () => {
    const client = new DhanClient({ clientId: CLIENT_ID, token: "sandbox", mode: "sandbox" });

    expect(() =>
      client.auth.enableAutoTokenManagement({ clientId: CLIENT_ID, pin: "1234", totpSecret: "JBSWY3DPEHPK3PXP" }),
    ).toThrow(AuthenticationError);
  });
});

describe("DhanClient.fromEnv PIN/TOTP", () => {
  const base = { DHAN_CLIENT_ID: CLIENT_ID, DHAN_PIN: "1234", DHAN_TOTP_SECRET: "JBSWY3DPEHPK3PXP" };

  it("enables token management with a file cache", async () => {
    mockBroker();
    const client = DhanClient.fromEnv({ ...base, DHAN_TOKEN_CACHE_DIR: dir });

    expect(client.getTokenManager()).toBeDefined();
    expect(client.getConfig().token).toBeUndefined();
    await client.getTokenManager()!.ensureValidToken();
    expect(await new FileTokenStore({ directory: dir }).load(CLIENT_ID)).toMatchObject({ accessToken: "fresh-1" });
  });

  it("takes precedence over a static token", () => {
    const client = DhanClient.fromEnv({ ...base, DHAN_ACCESS_TOKEN: "static", DHAN_TOKEN_CACHE: "off" });

    expect(client.getTokenManager()).toBeDefined();
    expect(client.getConfig().token).toBeUndefined();
  });

  it("can run without the cache", async () => {
    mockBroker();
    const client = DhanClient.fromEnv({ ...base, DHAN_TOKEN_CACHE: "off", DHAN_TOKEN_CACHE_DIR: dir });

    await client.getTokenManager()!.ensureValidToken();
    expect(await new FileTokenStore({ directory: dir }).load(CLIENT_ID)).toBeUndefined();
  });

  it("requires both the PIN and the TOTP secret", () => {
    expect(() => DhanClient.fromEnv({ DHAN_CLIENT_ID: CLIENT_ID, DHAN_PIN: "1234" })).toThrow(
      /needs both DHAN_PIN and DHAN_TOTP_SECRET/,
    );
  });

  it("ignores PIN/TOTP in sandbox mode", () => {
    const client = DhanClient.fromEnv({ ...base, DHAN_MODE: "sandbox", DHAN_ACCESS_TOKEN: "sandbox-token" });

    expect(client.getTokenManager()).toBeUndefined();
    expect(client.getConfig().token).toBe("sandbox-token");
  });
});
