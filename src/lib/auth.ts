import axios, { AxiosError, AxiosInstance } from "axios";

import { camelizeKeys } from "../util/camelize";
import { DEFAULT_API_BASE_URL } from "./constants";
import type {
  AuthChallengeResendResponse,
  AuthSessionCreateData,
  AuthSessionCreateResponse,
  AuthSessionListResponse,
  AuthSessionRevokeResponse,
  AuthSessionRevokeOthersResponse,
  AuthSessionVerifyResponse,
} from "./types";

type AuthHeaders = Record<string, string>;
const CONTROLLED_AUTH_HEADERS = new Set([
  "authorization",
  "x-bold-tenant-slug",
  "x-bold-session-id",
]);

export type AuthClientOptions = {
  baseURL?: string;
  tenantSlug: string;
  upstreamJwt?: string;
  headers?: AuthHeaders;
};

export type AuthRequestOptions = {
  tenantSlug?: string;
  upstreamJwt?: string;
  headers?: AuthHeaders;
};

type AuthClientConfig = Required<Pick<AuthClientOptions, "tenantSlug">> &
  Pick<AuthClientOptions, "upstreamJwt" | "headers">;

export class AuthAPIError extends Error {
  readonly status?: number;
  readonly originalError?: Error;

  constructor(method: string, url: string, error: unknown) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.response?.data?.code ||
        error.message;
      super(`${method} ${url} failed (${status}): ${message}`);
      this.status = status;
      this.originalError = error;
    } else if (error instanceof Error) {
      super(`${method} ${url} failed: ${error.message}`);
      this.originalError = error;
    } else {
      super(`${method} ${url} failed: ${String(error)}`);
    }
    this.name = "AuthAPIError";
  }
}

function requireValue(value: string | undefined, message: string): string {
  if (!value || typeof value !== "string") throw new Error(message);
  return value;
}

function bearer(value: string): string {
  return value.startsWith("Bearer ") ? value : `Bearer ${value}`;
}

function customHeaders(...sources: Array<AuthHeaders | undefined>): AuthHeaders {
  return sources.reduce<AuthHeaders>((headers, source) => {
    if (!source) return headers;

    for (const [key, value] of Object.entries(source)) {
      if (!CONTROLLED_AUTH_HEADERS.has(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    return headers;
  }, {});
}

function authHeaders(
  config: AuthClientConfig,
  options: AuthRequestOptions = {},
  extraHeaders: AuthHeaders = {}
): AuthHeaders {
  const tenantSlug = requireValue(
    options.tenantSlug ?? config.tenantSlug,
    "Tenant slug is required"
  );

  const upstreamJwt = requireValue(
    options.upstreamJwt ?? config.upstreamJwt,
    "Upstream JWT is required"
  );

  return {
    ...customHeaders(config.headers, options.headers),
    Authorization: bearer(upstreamJwt),
    "X-Bold-Tenant-Slug": tenantSlug,
    ...extraHeaders,
  };
}

async function get<T>(
  client: AxiosInstance,
  config: AuthClientConfig,
  url: string,
  options?: AuthRequestOptions
): Promise<T> {
  try {
    const res = await client.get(url, { headers: authHeaders(config, options) });
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new AuthAPIError("GET", url, error);
  }
}

async function post<T>(
  client: AxiosInstance,
  config: AuthClientConfig,
  url: string,
  data?: Record<string, unknown>,
  options?: AuthRequestOptions,
  extraHeaders?: AuthHeaders
): Promise<T> {
  try {
    const res = await client.post(url, data, {
      headers: authHeaders(config, options, extraHeaders),
    });
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new AuthAPIError("POST", url, error);
  }
}

export function createAuthClient(options: AuthClientOptions) {
  const tenantSlug = requireValue(options.tenantSlug, "Tenant slug is required");
  const client = axios.create({
    baseURL: options.baseURL ?? DEFAULT_API_BASE_URL,
  });

  const config: AuthClientConfig = {
    tenantSlug,
    upstreamJwt: options.upstreamJwt,
    headers: options.headers ?? {},
  };

  return {
    sessions: {
      create: (data: AuthSessionCreateData, requestOptions?: AuthRequestOptions) => {
        if (!data?.deviceId) throw new Error("Device ID is required");
        if (!data?.platform) throw new Error("Platform is required");

        return post<AuthSessionCreateResponse>(
          client,
          config,
          "auth/sessions",
          {
            device_id: data.deviceId,
            platform: data.platform,
            user_agent: data.userAgent,
          },
          requestOptions
        );
      },
      list: (requestOptions?: AuthRequestOptions) => {
        return get<AuthSessionListResponse>(client, config, "auth/sessions", requestOptions);
      },
      verify: (sessionId: string, requestOptions?: AuthRequestOptions) => {
        if (!sessionId) throw new Error("Session ID is required");
        return get<AuthSessionVerifyResponse>(
          client,
          config,
          `auth/sessions/${encodeURIComponent(sessionId)}/verify`,
          requestOptions
        );
      },
      revoke: (sessionId: string, requestOptions?: AuthRequestOptions) => {
        if (!sessionId) throw new Error("Session ID is required");
        return post<AuthSessionRevokeResponse>(
          client,
          config,
          `auth/sessions/${encodeURIComponent(sessionId)}/revoke`,
          undefined,
          requestOptions
        );
      },
      revokeOthers: (currentSessionId: string, requestOptions?: AuthRequestOptions) => {
        if (!currentSessionId) throw new Error("Current session ID is required");
        return post<AuthSessionRevokeOthersResponse>(
          client,
          config,
          "auth/sessions/revoke-others",
          undefined,
          requestOptions,
          { "X-Bold-Session-Id": currentSessionId }
        );
      },
    },
    challenges: {
      verify: (challengeId: string, code: string, requestOptions?: AuthRequestOptions) => {
        if (!challengeId) throw new Error("Challenge ID is required");
        if (!code) throw new Error("Challenge code is required");

        return post<AuthSessionCreateResponse>(
          client,
          config,
          `auth/challenges/${encodeURIComponent(challengeId)}/verify`,
          { code },
          requestOptions
        );
      },
      resend: (challengeId: string, requestOptions?: AuthRequestOptions) => {
        if (!challengeId) throw new Error("Challenge ID is required");
        return post<AuthChallengeResendResponse>(
          client,
          config,
          `auth/challenges/${encodeURIComponent(challengeId)}/resend`,
          undefined,
          requestOptions
        );
      },
    },
  };
}
