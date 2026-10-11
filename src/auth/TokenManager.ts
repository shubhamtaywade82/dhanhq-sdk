import { AuthenticationError } from "../errors";
import type { DhanClientConfig } from "../types/common.types";
import { DhanAuth } from "./DhanAuth";
import { TokenResponse } from "./TokenResponse";
import type { TokenStore } from "./TokenStore";

export interface EnableAutoTokenManagementOptions {
  clientId: string;
  pin: string;
  /**
   * Base32 TOTP secret. Either this or {@link totpProvider} is required —
   * supply `totpProvider` instead when the code comes from a hardware token
   * or an external MFA service rather than a stored secret.
   */
  totpSecret?: string;
  /** Returns a current 6-digit code. Takes precedence over `totpSecret`. */
  totpProvider?: () => string | Promise<string>;
  /** How long before expiry to renew. Defaults to 5 minutes. */
  renewBeforeMs?: number;
  /** Called after every successful generate or renew. */
  onToken?: (token: TokenResponse) => void;
  /**
   * Persists the token across restarts (e.g. {@link FileTokenStore}). A
   * stored token that is still valid is reused instead of logging in again;
   * every fresh login or renewal is written back.
   */
  store?: TokenStore;
  /**
   * Called when the store fails to load, save or clear. The token itself is
   * still served — a broken cache costs a login, never an outage.
   */
  onStoreError?: (error: unknown) => void;
  /**
   * After a 401, a fresh login is skipped when the current token was issued by
   * the broker less than this long ago (a brand-new token being rejected is
   * not fixed by another login). Defaults to 60 seconds.
   */
  minReloginIntervalMs?: number;
}

/**
 * Keeps a valid access token available, renewing it before it expires.
 *
 * Concurrent callers share one in-flight auth call. Without that, every
 * request arriving while the token is stale would start its own login, and
 * since generating a token can invalidate the previous one, a burst of
 * traffic could leave the SDK holding a token the broker has already
 * replaced.
 */
export class TokenManager {
  private token?: TokenResponse;
  private inFlight?: Promise<string>;
  private readonly renewBeforeMs: number;
  private readonly minReloginIntervalMs: number;
  /** When the broker last issued `token`; undefined for a token read from the store. */
  private issuedAt?: number;
  private storeChecked = false;

  constructor(
    private readonly config: DhanClientConfig,
    private readonly options: EnableAutoTokenManagementOptions,
  ) {
    if (!options.totpSecret && !options.totpProvider) {
      throw new AuthenticationError(
        "TokenManager",
        "either totpSecret or totpProvider is required",
      );
    }

    this.renewBeforeMs = options.renewBeforeMs ?? 5 * 60 * 1000;
    this.minReloginIntervalMs = options.minReloginIntervalMs ?? 60 * 1000;
  }

  /** Returns a usable token, generating or renewing only when needed. */
  public async ensureValidToken(): Promise<string> {
    if (this.token && !this.token.needsRefresh(this.renewBeforeMs)) {
      return this.token.accessToken;
    }

    // Coalesce: whoever arrives while a login is in progress waits on it
    // rather than starting a competing one.
    this.inFlight ??= this.acquire().finally(() => {
      this.inFlight = undefined;
    });

    return this.inFlight;
  }

  /**
   * Reacts to a 401: drops the rejected token (in memory and in the store)
   * and logs in again, unless the broker issued the current token moments ago.
   * Wired to `onTokenExpired` by `client.auth.enableAutoTokenManagement`.
   */
  public async handleUnauthorized(): Promise<void> {
    if (this.inFlight) {
      await this.inFlight;
      return;
    }

    if (this.issuedAt !== undefined && Date.now() - this.issuedAt < this.minReloginIntervalMs) {
      return;
    }

    this.clear();
    await this.ensureValidToken();
  }

  /** Forces a fresh login, ignoring any cached token. */
  public async generate(): Promise<string> {
    const token = await DhanAuth.generateAccessToken({
      clientId: this.options.clientId,
      pin: this.options.pin,
      totp: await this.resolveTotp(),
    });

    return this.apply(token);
  }

  /**
   * Extends the current token, falling back to a full login.
   *
   * Renewal only works while the existing token is still valid, so an expired
   * or rejected token has to go through the PIN/TOTP path again.
   */
  public async refresh(): Promise<string> {
    if (!this.token) {
      return this.generate();
    }

    try {
      const renewed = await DhanAuth.renewWebToken({
        token: this.token.accessToken,
        clientId: this.options.clientId,
        baseURL: this.config.baseURL,
      });

      return await this.apply(renewed);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return this.generate();
      }

      throw error;
    }
  }

  /** The current token, if one has been obtained. */
  public getToken(): TokenResponse | undefined {
    return this.token;
  }

  /** Drops the cached token (and the stored copy) so the next call logs in again. */
  public clear(): void {
    this.token = undefined;
    this.issuedAt = undefined;
    this.config.token = undefined;
    // Never re-read the store after a clear: it holds the token just dropped.
    this.storeChecked = true;

    const store = this.options.store;
    if (store) {
      void Promise.resolve()
        .then(() => store.clear(this.options.clientId))
        .catch((error: unknown) => this.options.onStoreError?.(error));
    }
  }

  private async acquire(): Promise<string> {
    if (!this.token && !this.storeChecked) {
      this.storeChecked = true;
      const stored = await this.loadStored();
      if (stored) {
        this.adopt(stored);
        if (!stored.needsRefresh(this.renewBeforeMs)) {
          return stored.accessToken;
        }
      }
    }

    return this.token ? this.refresh() : this.generate();
  }

  /** A stored token for this client that has not yet expired, if any. */
  private async loadStored(): Promise<TokenResponse | undefined> {
    const store = this.options.store;
    if (!store) return undefined;

    try {
      const raw = await store.load(this.options.clientId);
      if (!raw) return undefined;

      const token = new TokenResponse(raw);
      if (token.clientId && token.clientId !== this.options.clientId) return undefined;
      // An expired token cannot be renewed, so it is no better than nothing.
      return token.isExpired() ? undefined : token;
    } catch (error) {
      this.options.onStoreError?.(error);
      return undefined;
    }
  }

  private adopt(token: TokenResponse): void {
    this.token = token;
    this.issuedAt = undefined;
    this.config.token = token.accessToken;

    if (token.clientId) {
      this.config.clientId = token.clientId;
    }
  }

  private async resolveTotp(): Promise<string> {
    if (this.options.totpProvider) {
      const totp = (await this.options.totpProvider()).trim();

      if (totp.length === 0) {
        throw new AuthenticationError(
          "TokenManager",
          "totpProvider returned an empty code",
        );
      }

      return totp;
    }

    return DhanAuth.generateTotp(this.options.totpSecret as string);
  }

  private async apply(token: TokenResponse): Promise<string> {
    this.adopt(token);
    this.issuedAt = Date.now();

    if (this.options.store) {
      try {
        await this.options.store.save(this.options.clientId, token.raw);
      } catch (error) {
        this.options.onStoreError?.(error);
      }
    }

    this.options.onToken?.(token);
    return token.accessToken;
  }
}
