import { HttpClient } from "../client/HttpClient";
import { DataApiSubscriptionError } from "../errors/DataApiSubscriptionError";

export interface ProfileResponse {
  dhanClientId?: string;
  tokenValidity?: string;
  activeSegment?: string;
  ddpi?: string;
  mtf?: string;
  dataPlan?: string;
  dataValidity?: string;
  [key: string]: unknown;
}

/** Data API plan status from the profile, read from the production account. */
export interface DataSubscriptionStatus {
  /** True only when the profile's `dataPlan` is exactly `"Active"`. */
  active: boolean;
  /** `dataPlan` as Dhan returned it (`"Active"` / `"Deactive"`), or undefined if absent. */
  status?: string;
  /** `dataValidity` as Dhan returned it. Format is not documented, so it is not parsed. */
  validity?: string;
}

/** Account profile (`GET /v2/profile`). */
export class Profile {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Raw profile. Under `mode: "hybrid"` this is routed like other account
   * calls (sandbox); use {@link dataSubscription} for the production plan.
   */
  public async get(): Promise<ProfileResponse> {
    return this.httpClient.request<ProfileResponse>({
      method: "GET",
      url: "/profile",
      safeToRetry: true,
    });
  }

  /**
   * Data API plan status of the production account. Always reads production,
   * in every mode, because data APIs are production-only.
   */
  public async dataSubscription(): Promise<DataSubscriptionStatus> {
    const profile = await this.httpClient.request<ProfileResponse>({
      method: "GET",
      url: "/profile",
      safeToRetry: true,
      environment: "live",
    });

    return {
      active: profile.dataPlan === "Active",
      status: profile.dataPlan,
      validity: profile.dataValidity,
    };
  }

  /**
   * Throws {@link DataApiSubscriptionError} unless the production profile shows
   * an active Data API plan. Call it once at startup to fail fast, before data
   * calls that would otherwise be rejected with DH-902.
   */
  public async assertDataApiActive(): Promise<void> {
    const { active, status, validity } = await this.dataSubscription();
    if (active) {
      return;
    }

    throw new DataApiSubscriptionError(
      `Data API subscription is not active on the production account (profile dataPlan: ${
        status ?? "absent"
      }${validity ? `, dataValidity: ${validity}` : ""}). Subscribe to the Data API plan, then retry.`,
    );
  }
}
