import type { AxiosInstance } from "axios";

import { HttpClient } from "../src/client/HttpClient";
import { RateLimiter } from "../src/client/RateLimiter";
import { SANDBOX_BASE_URL } from "../src/client/Environment";
import { DataApiSubscriptionError } from "../src/errors/DataApiSubscriptionError";
import { ApiResponseError } from "../src/errors/ApiResponseError";
import { Profile, type ProfileResponse } from "../src/resources/Profile";
import type { DhanClientConfig } from "../src/types/common.types";

type Captured = { baseURL?: string; url?: string; headers?: Record<string, string> };

const PROFILE: ProfileResponse = {
  dhanClientId: "1100003626",
  tokenValidity: "30/03/2025 15:37",
  activeSegment: "Equity, Derivative, Currency, Commodity",
  ddpi: "Active",
  mtf: "Active",
  dataPlan: "Active",
  dataValidity: "2024-12-05 09:37:52.0",
};

function profileClient(config: Partial<DhanClientConfig>, profile: ProfileResponse) {
  const requests: Captured[] = [];
  const axiosInstance = {
    request: jest.fn(async (captured: Captured) => {
      requests.push(captured);
      return { data: profile };
    }),
  } as unknown as AxiosInstance;
  const client = new HttpClient(
    { clientId: "1000000001", token: "live-token", ...config },
    { axiosInstance, rateLimiter: new RateLimiter({ minTime: 0 }), circuitBreaker: false },
  );
  return { profile: new Profile(client), requests };
}

describe("Profile.dataSubscription()", () => {
  it("reports an active Data API plan, with validity returned as-is", async () => {
    const { profile } = profileClient({}, PROFILE);

    await expect(profile.dataSubscription()).resolves.toEqual({
      active: true,
      status: "Active",
      validity: "2024-12-05 09:37:52.0",
    });
  });

  it("reports a deactive plan as inactive", async () => {
    const { profile } = profileClient({}, { ...PROFILE, dataPlan: "Deactive" });

    await expect(profile.dataSubscription()).resolves.toMatchObject({ active: false, status: "Deactive" });
  });

  it("treats an absent dataPlan as inactive rather than guessing", async () => {
    const { dataPlan: _omitted, ...withoutPlan } = PROFILE;
    const { profile } = profileClient({}, withoutPlan);

    await expect(profile.dataSubscription()).resolves.toMatchObject({ active: false, status: undefined });
  });

  it("reads the production account in hybrid mode, with the live token", async () => {
    const { profile, requests } = profileClient(
      { mode: "hybrid", sandboxToken: "sandbox-token", sandboxClientId: "sandbox-client" },
      PROFILE,
    );

    await profile.dataSubscription();

    expect(requests).toHaveLength(1);
    expect(requests[0].baseURL).toBeUndefined();
    expect(requests[0].headers?.["access-token"]).toBe("live-token");
  });

  it("keeps get() on its existing hybrid routing (sandbox), so callers see no change", async () => {
    const { profile, requests } = profileClient(
      { mode: "hybrid", sandboxToken: "sandbox-token", sandboxClientId: "sandbox-client" },
      PROFILE,
    );

    await profile.get();

    expect(requests[0].baseURL).toBe(SANDBOX_BASE_URL);
    expect(requests[0].headers?.["access-token"]).toBe("sandbox-token");
  });
});

describe("Profile.assertDataApiActive()", () => {
  it("resolves when the production plan is active", async () => {
    const { profile } = profileClient({}, PROFILE);

    await expect(profile.assertDataApiActive()).resolves.toBeUndefined();
  });

  it("throws DataApiSubscriptionError with the plan state when the plan is inactive", async () => {
    const { profile } = profileClient({}, { ...PROFILE, dataPlan: "Deactive" });

    const error = await profile.assertDataApiActive().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataApiSubscriptionError);
    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error).toMatchObject({ code: "DATA_API_NOT_SUBSCRIBED", errorCode: undefined, status: undefined });
    expect((error as Error).message).toContain("dataPlan: Deactive");
    expect((error as Error).message).toContain("dataValidity: 2024-12-05 09:37:52.0");
  });

  it("fails closed with an absent dataPlan", async () => {
    const { dataPlan: _omitted, ...withoutPlan } = PROFILE;
    const { profile } = profileClient({}, withoutPlan);

    const error = await profile.assertDataApiActive().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataApiSubscriptionError);
    expect((error as Error).message).toContain("dataPlan: absent");
  });
});
