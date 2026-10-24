import { promises as fs } from "fs";
import { homedir } from "os";
import { join } from "path";

import type { RawTokenResponse } from "./TokenResponse";

/**
 * Where {@link TokenManager} keeps a token between process restarts.
 *
 * Without one, every restart logs in again. Generating a token can invalidate
 * the previous one, so a short-lived script (a cron job, a smoke test) would
 * knock out the token a long-running bot on the same account is using.
 *
 * Implementations hold a live trading credential: keep them private to the
 * account that runs the SDK.
 */
export interface TokenStore {
  /** The stored payload for this client, or `undefined` when there is none. */
  load(
    clientId: string,
  ): Promise<RawTokenResponse | undefined> | RawTokenResponse | undefined;
  save(clientId: string, raw: RawTokenResponse): Promise<void> | void;
  clear(clientId: string): Promise<void> | void;
}

/** In-process store — shares a token between clients in one process only. */
export class MemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, RawTokenResponse>();

  public load(clientId: string): RawTokenResponse | undefined {
    return this.tokens.get(clientId);
  }

  public save(clientId: string, raw: RawTokenResponse): void {
    this.tokens.set(clientId, raw);
  }

  public clear(clientId: string): void {
    this.tokens.delete(clientId);
  }
}

export interface FileTokenStoreOptions {
  /**
   * Directory for the token files. Defaults to `DHAN_TOKEN_CACHE_DIR`, then
   * `~/.dhanhq`. Created with mode 0700 when missing.
   */
  directory?: string;
}

interface StoredTokenFile {
  clientId: string;
  savedAt: string;
  token: RawTokenResponse;
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * One JSON file per client id (`dhan-token-<clientId>.json`, mode 0600),
 * written atomically through a temp file and rename so a crash mid-write
 * never leaves a half-written token behind.
 *
 * A missing, unreadable or corrupt file reads as "no token", so a bad cache
 * costs one fresh login, never a failed start.
 */
export class FileTokenStore implements TokenStore {
  public readonly directory: string;

  constructor(options: FileTokenStoreOptions = {}) {
    this.directory =
      options.directory ??
      process.env.DHAN_TOKEN_CACHE_DIR ??
      join(homedir(), ".dhanhq");
  }

  public pathFor(clientId: string): string {
    if (!CLIENT_ID_PATTERN.test(clientId)) {
      throw new Error(
        `FileTokenStore: refusing unsafe client id ${JSON.stringify(clientId)}`,
      );
    }
    return join(this.directory, `dhan-token-${clientId}.json`);
  }

  public async load(clientId: string): Promise<RawTokenResponse | undefined> {
    let text: string;
    try {
      text = await fs.readFile(this.pathFor(clientId), "utf8");
    } catch {
      return undefined;
    }

    try {
      const parsed = JSON.parse(text) as Partial<StoredTokenFile>;
      if (
        parsed.clientId !== clientId ||
        typeof parsed.token !== "object" ||
        parsed.token === null
      ) {
        return undefined;
      }
      return parsed.token;
    } catch {
      return undefined;
    }
  }

  public async save(clientId: string, raw: RawTokenResponse): Promise<void> {
    const target = this.pathFor(clientId);
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });

    const body: StoredTokenFile = {
      clientId,
      savedAt: new Date().toISOString(),
      token: raw,
    };
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(body), { mode: 0o600 });
      await fs.rename(temp, target);
    } catch (error) {
      await fs.rm(temp, { force: true });
      throw error;
    }
    // rename keeps the temp file's mode, but a pre-existing file created by an
    // older version may be wider; tighten it either way.
    await fs.chmod(target, 0o600);
  }

  public async clear(clientId: string): Promise<void> {
    await fs.rm(this.pathFor(clientId), { force: true });
  }
}
