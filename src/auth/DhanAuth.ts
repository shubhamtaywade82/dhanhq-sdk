import { createHmac } from "crypto";

import axios, { AxiosError, type AxiosInstance } from "axios";

import { AuthenticationError } from "../errors";
import { TokenResponse, type RawTokenResponse } from "./TokenResponse";

export const AUTH_BASE_URL = "https://auth.dhan.co";
export const API_BASE_URL = "https://api.dhan.co/v2";

export interface GenerateAccessTokenRequest {
  clientId: string;
  pin: string;
  /** A current 6-digit code. Use {@link DhanAuth.generateTotp} to derive one. */
  totp: string;
}

export interface RenewWebTokenRequest {
  token: string;
  clientId: string;
  baseURL?: string;
}

/** Retained for callers that referenced the previous loose response shape. */
export type TokenResponseData = RawTokenResponse;

export interface DhanAuthDependencies {
  axiosInstance?: AxiosInstance;
}

export interface TotpOptions {
  timestamp?: number;
  digits?: number;
  period?: number;
}

export class DhanAuth {
  /**
   * RFC 6238 TOTP from a base32 secret.
   *
   * Provided so a headless process can log in without a phone, but note that
   * the secret is then as sensitive as the PIN — anything holding both can
   * mint tokens for the account indefinitely.
   */
  public static generateTotp(
    secret: string,
    options: TotpOptions = {},
  ): string {
    const digits = options.digits ?? 6;
    const period = options.period ?? 30;
    const timestamp = options.timestamp ?? Date.now();
    const counter = Math.floor(timestamp / 1000 / period);
    const key = base32Decode(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buffer.writeUInt32BE(counter % 0x100000000, 4);

    const digest = createHmac("sha1", key).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;

    return code.toString().padStart(digits, "0");
  }

  /** Seconds until the current TOTP window rolls over. */
  public static totpSecondsRemaining(
    options: Pick<TotpOptions, "timestamp" | "period"> = {},
  ): number {
    const period = options.period ?? 30;
    const timestamp = options.timestamp ?? Date.now();
    return period - (Math.floor(timestamp / 1000) % period);
  }

  /** Exchanges client id + PIN + TOTP for an access token. */
  public static async generateAccessToken(
    request: GenerateAccessTokenRequest,
    dependencies: DhanAuthDependencies = {},
  ): Promise<TokenResponse> {
    const client =
      dependencies.axiosInstance ??
      axios.create({ baseURL: AUTH_BASE_URL, timeout: 5000 });

    const data = await send(
      "GenerateAccessToken",
      client.post<RawTokenResponse>("/app/generateAccessToken", undefined, {
        params: {
          dhanClientId: request.clientId,
          pin: request.pin,
          totp: request.totp,
        },
        headers: { Accept: "application/json" },
      }),
    );

    return new TokenResponse(data);
  }

  /**
   * Extends an existing token without a fresh PIN/TOTP round trip.
   *
   * Only works while the current token is still valid — once it has expired,
   * {@link generateAccessToken} is the only way back in.
   */
  public static async renewWebToken(
    request: RenewWebTokenRequest,
    dependencies: DhanAuthDependencies = {},
  ): Promise<TokenResponse> {
    const client =
      dependencies.axiosInstance ??
      axios.create({
        baseURL: request.baseURL ?? API_BASE_URL,
        timeout: 5000,
      });

    const data = await send(
      "RenewToken",
      client.post<RawTokenResponse>("/RenewToken", undefined, {
        headers: {
          "access-token": request.token,
          dhanClientId: request.clientId,
          Accept: "application/json",
        },
      }),
    );

    return new TokenResponse(data);
  }
}

/**
 * Normalizes auth transport failures.
 *
 * Without this a raw `AxiosError` escapes, which is inconsistent with every
 * other call path in the SDK and drops the broker's own `errorMessage` — the
 * part that says whether the PIN or the TOTP was the problem.
 */
async function send(
  context: string,
  pending: Promise<{ data: RawTokenResponse }>,
): Promise<RawTokenResponse> {
  try {
    const response = await pending;
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<Record<string, unknown>>;

    if (axiosError?.response) {
      const body = axiosError.response.data ?? {};
      const message = pickMessage(body) ?? `HTTP ${axiosError.response.status}`;

      throw new AuthenticationError(context, message, {
        status: axiosError.response.status,
        details: body,
        cause: error,
      });
    }

    throw new AuthenticationError(
      context,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}

function pickMessage(body: Record<string, unknown>): string | undefined {
  for (const key of ["errorMessage", "message", "error", "errorType"]) {
    const value = body[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";

  for (const char of cleaned) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }

  return Buffer.from(bytes);
}
