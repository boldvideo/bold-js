import { AxiosError, AxiosInstance } from "axios";

import { camelizeKeys } from "../util/camelize";
import type { ConversationStarter, ListConversationStartersOptions } from "./types";

type ApiClient = AxiosInstance;

export class ConversationStartersAPIError extends Error {
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
    this.name = "ConversationStartersAPIError";
  }
}

async function get<T>(client: ApiClient, url: string): Promise<T> {
  try {
    const res = await client.get(url);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new ConversationStartersAPIError("GET", url, error);
  }
}

export function createConversationStarters(client: ApiClient) {
  return {
    list: async (
      options: ListConversationStartersOptions = {}
    ): Promise<{ data: ConversationStarter[] }> => {
      const qs = new URLSearchParams();
      if (options.collectionIds?.length) {
        qs.set("collection_ids", options.collectionIds.join(","));
      }
      const query = qs.toString();
      return get(client, `conversation-starters${query ? `?${query}` : ""}`);
    },
  };
}
