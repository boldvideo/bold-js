import { AxiosError, AxiosInstance } from "axios";

import { camelizeKeys } from "../util/camelize";
import type {
  NotificationPreferencesResponse,
  UpdateNotificationPreferencesData,
} from "./types";

type ApiClient = AxiosInstance;

export class NotificationsAPIError extends Error {
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
    this.name = "NotificationsAPIError";
  }
}

function notificationPreferencesPath(viewerId: string): string {
  if (!viewerId) throw new Error("Viewer ID is required");
  return `viewers/${encodeURIComponent(viewerId)}/notification-preferences`;
}

async function get<T>(client: ApiClient, url: string): Promise<T> {
  try {
    const res = await client.get(url);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new NotificationsAPIError("GET", url, error);
  }
}

async function patch<T>(
  client: ApiClient,
  url: string,
  data: Record<string, unknown>
): Promise<T> {
  try {
    const res = await client.patch(url, data);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new NotificationsAPIError("PATCH", url, error);
  }
}

export function createNotifications(client: ApiClient) {
  return {
    getPreferences: (viewerId: string) => {
      return get<NotificationPreferencesResponse>(
        client,
        notificationPreferencesPath(viewerId)
      );
    },
    updatePreferences: (
      viewerId: string,
      data: UpdateNotificationPreferencesData
    ) => {
      const path = notificationPreferencesPath(viewerId);
      const channels: Record<string, boolean> = {};

      if (data?.channels?.email !== undefined) {
        channels.email = data.channels.email;
      }
      if (data?.channels?.push !== undefined) {
        channels.push = data.channels.push;
      }
      if (Object.keys(channels).length === 0) {
        throw new Error("At least one notification channel is required");
      }

      return patch<NotificationPreferencesResponse>(client, path, { channels });
    },
  };
}
