import { AxiosError, AxiosInstance } from "axios";

import { camelizeKeys } from "../util/camelize";
import type {
  SessionManagementRevokeAllResponse,
  SessionManagementRevokeSessionResponse,
  SessionManagementViewerResolveResponse,
  SessionManagementViewerSessionsResponse,
} from "./types";

type ApiClient = AxiosInstance;

export class SessionManagementAPIError extends Error {
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
    this.name = "SessionManagementAPIError";
  }
}

export type SessionManagementRevokeOptions = {
  reason?: string;
};

function byExternalIdPath(externalId: string): string {
  if (!externalId) throw new Error("External ID is required");
  return `session-management/viewers/by-external-id/${encodeURIComponent(externalId)}`;
}

async function get<T>(client: ApiClient, url: string): Promise<T> {
  try {
    const res = await client.get(url);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new SessionManagementAPIError("GET", url, error);
  }
}

async function post<T>(
  client: ApiClient,
  url: string,
  data?: Record<string, unknown>
): Promise<T> {
  try {
    const res = await client.post(url, data);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new SessionManagementAPIError("POST", url, error);
  }
}

export function createSessionManagement(client: ApiClient) {
  return {
    resolveViewerByExternalId: (externalId: string) => {
      return get<SessionManagementViewerResolveResponse>(
        client,
        byExternalIdPath(externalId)
      );
    },
    listViewerSessionsByExternalId: (externalId: string) => {
      return get<SessionManagementViewerSessionsResponse>(
        client,
        `${byExternalIdPath(externalId)}/sessions`
      );
    },
    revokeViewerSessionByExternalId: (
      externalId: string,
      sessionId: string,
      options: SessionManagementRevokeOptions = {}
    ) => {
      if (!sessionId) throw new Error("Session ID is required");

      return post<SessionManagementRevokeSessionResponse>(
        client,
        `${byExternalIdPath(externalId)}/sessions/${encodeURIComponent(sessionId)}/revoke`,
        { reason: options.reason }
      );
    },
    revokeAllViewerSessionsByExternalId: (
      externalId: string,
      options: SessionManagementRevokeOptions = {}
    ) => {
      return post<SessionManagementRevokeAllResponse>(
        client,
        `${byExternalIdPath(externalId)}/sessions/revoke-all`,
        { reason: options.reason }
      );
    },
  };
}
