---
title: "feat: Add Viewers & Progress Tracking API to SDK"
type: feat
date: 2026-01-23
---

# Add Viewers & Progress Tracking API to SDK

## Overview

Implement the Viewers API in the bold-js SDK to enable course platforms to sync external users and track their video watch progress. Adds a new `bold.viewers` namespace with CRUD operations and flat progress methods.

## Problem Statement / Motivation

Course platforms integrating Bold Video need to:
1. Sync their user database with Bold's viewer system
2. Track which videos users have watched and their progress
3. Mark videos as complete for course completion tracking
4. Query progress filtered by collection (course)

The backend API exists (`/api/v1/viewers/*`), but the SDK doesn't expose it yet.

## Proposed Solution

Add a new `viewers` module following the existing `fetchers.ts` pattern:
- Curried functions that take axios client
- Flat method naming (no nested namespaces)
- Use existing `Response<T>` wrapper type
- Minimal new types - only what's necessary

### API Surface

```typescript
const bold = createClient(apiKey);

// Viewer CRUD
bold.viewers.list()
bold.viewers.get(id)
bold.viewers.lookup({ externalId })  // or { email }
bold.viewers.create({ name, email?, externalId?, traits? })
bold.viewers.update(id, { name?, email?, externalId?, traits? })

// Progress tracking (flat methods on viewers namespace)
bold.viewers.listProgress(viewerId, options?)
bold.viewers.getProgress(viewerId, videoId)
bold.viewers.saveProgress(viewerId, videoId, { currentTime, duration })
```

### Deferred Features (YAGNI)

These can be added when requested:
- `viewers.delete(id)` - rare admin action
- `viewers.deleteProgress(viewerId, videoId)` - rare admin action
- `viewers.completeProgress(viewerId, videoId)` - use `saveProgress` with full duration
- Progress list pagination

### Implemented (originally deferred)
- `viewers.lookup({ externalId } | { email })` - **Added**: essential for course platforms syncing users

## Technical Approach

### Architecture

Follow the established `fetchers.ts` pattern (not the `ai.ts` factory pattern):

```
/src
├── lib/
│   ├── viewers.ts         # NEW: viewer fetcher functions
│   ├── types.ts           # ADD: Viewer, ViewerProgress types
│   └── client.ts          # MODIFY: add viewers namespace
└── index.ts               # MODIFY: export new types
```

### Implementation

**Tasks:**
- [x] Add viewer types to `/src/lib/types.ts`
- [x] Create `/src/lib/viewers.ts` with fetcher functions
- [x] Wire up viewers in `/src/lib/client.ts`
- [x] Export types from `/src/index.ts`

**File: `/src/lib/types.ts` (additions ~30 lines)**

```typescript
// ============================================
// Viewers API Types
// ============================================

/**
 * Viewer represents an external user from a course platform
 */
export type Viewer = {
  id: string;
  name: string;
  email?: string;
  externalId?: string;
  /** Key-value metadata. Keys must start with letter/underscore, contain only alphanumeric/underscore */
  traits?: Record<string, unknown>;
  insertedAt: string;
  updatedAt: string;
};

/**
 * Progress record for a viewer-video pair
 */
export type ViewerProgress = {
  id: string;
  viewerId: string;
  videoId: string;
  /** Current playback position in seconds */
  currentTime: number;
  /** Total video duration in seconds */
  duration: number;
  /** Calculated: (currentTime / duration) * 100 */
  percentage: number;
  completed: boolean;
  completedAt?: string;
  insertedAt: string;
  updatedAt: string;
};

/**
 * Options for listing viewer progress
 */
export type ListProgressOptions = {
  /** Filter by completion status */
  completed?: boolean;
  /** Filter to videos in a specific collection */
  collectionId?: string;
};
```

**File: `/src/lib/viewers.ts` (~90 lines)**

```typescript
import { AxiosInstance } from "axios";
import { camelizeKeys } from "../util/camelize";
import type { Viewer, ViewerProgress, ListProgressOptions } from "./types";

type Response<T> = { data: T };
type ApiClient = AxiosInstance;

// Re-use the get helper pattern from fetchers.ts
async function get<T>(client: ApiClient, url: string): Promise<T> {
  try {
    const res = await client.get(url);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    console.error(`Error fetching from ${url}`, error);
    throw error;
  }
}

async function post<T>(client: ApiClient, url: string, data?: Record<string, unknown>): Promise<T> {
  try {
    const res = await client.post(url, data);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    console.error(`Error posting to ${url}`, error);
    throw error;
  }
}

async function patch<T>(client: ApiClient, url: string, data: Record<string, unknown>): Promise<T> {
  try {
    const res = await client.patch(url, data);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    console.error(`Error patching ${url}`, error);
    throw error;
  }
}

// --- Viewer CRUD ---

export function fetchViewers(client: ApiClient) {
  return async () => {
    return get<{ viewers: Viewer[] }>(client, 'viewers');
  };
}

export function fetchViewer(client: ApiClient) {
  return async (id: string) => {
    if (!id) throw new Error('Viewer ID is required');
    return get<{ viewer: Viewer }>(client, `viewers/${id}`);
  };
}

export function createViewer(client: ApiClient) {
  return async (data: { name: string; email?: string; externalId?: string; traits?: Record<string, unknown> }) => {
    if (!data.name) throw new Error('Viewer name is required');
    return post<{ viewer: Viewer }>(client, 'viewers', {
      viewer: {
        name: data.name,
        email: data.email,
        external_id: data.externalId,
        traits: data.traits,
      }
    });
  };
}

export function updateViewer(client: ApiClient) {
  return async (id: string, data: { name?: string; email?: string; externalId?: string; traits?: Record<string, unknown> }) => {
    if (!id) throw new Error('Viewer ID is required');
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.email !== undefined) body.email = data.email;
    if (data.externalId !== undefined) body.external_id = data.externalId;
    if (data.traits !== undefined) body.traits = data.traits;
    return patch<{ viewer: Viewer }>(client, `viewers/${id}`, { viewer: body });
  };
}

// --- Progress Tracking (flat methods) ---

export function fetchViewerProgress(client: ApiClient) {
  return async (viewerId: string, options?: ListProgressOptions) => {
    if (!viewerId) throw new Error('Viewer ID is required');
    const params = new URLSearchParams();
    if (options?.completed !== undefined) params.set('completed', String(options.completed));
    if (options?.collectionId) params.set('collection_id', options.collectionId);
    const query = params.toString();
    const url = query ? `viewers/${viewerId}/progress?${query}` : `viewers/${viewerId}/progress`;
    return get<{ progress: ViewerProgress[]; meta: { total: number; completed: number; inProgress: number } }>(client, url);
  };
}

export function fetchProgress(client: ApiClient) {
  return async (viewerId: string, videoId: string) => {
    if (!viewerId) throw new Error('Viewer ID is required');
    if (!videoId) throw new Error('Video ID is required');
    return get<{ progress: ViewerProgress }>(client, `viewers/${viewerId}/progress/${videoId}`);
  };
}

export function saveProgress(client: ApiClient) {
  return async (viewerId: string, videoId: string, data: { currentTime: number; duration: number }) => {
    if (!viewerId) throw new Error('Viewer ID is required');
    if (!videoId) throw new Error('Video ID is required');
    if (data.currentTime === undefined) throw new Error('currentTime is required');
    if (data.duration === undefined) throw new Error('duration is required');
    return post<{ progress: ViewerProgress }>(client, `viewers/${viewerId}/progress/${videoId}`, {
      progress: {
        current_time: data.currentTime,
        duration: data.duration,
      }
    });
  };
}
```

**File: `/src/lib/client.ts` (changes)**

```typescript
import {
  fetchViewers,
  fetchViewer,
  createViewer,
  updateViewer,
  fetchViewerProgress,
  fetchProgress,
  saveProgress,
} from './viewers';

// In createClient(), add to return object:
return {
  settings: fetchSettings(apiClient),
  videos: { ... },
  playlists: { ... },
  viewers: {
    list: fetchViewers(apiClient),
    get: fetchViewer(apiClient),
    create: createViewer(apiClient),
    update: updateViewer(apiClient),
    listProgress: fetchViewerProgress(apiClient),
    getProgress: fetchProgress(apiClient),
    saveProgress: saveProgress(apiClient),
  },
  ai: createAI(aiConfig),
  trackEvent: ...,
  trackPageView: ...,
};
```

**File: `/src/index.ts` (additions)**

```typescript
export type {
  // ... existing exports ...

  // Viewers API
  Viewer,
  ViewerProgress,
  ListProgressOptions,
} from "./lib/types";
```

## Acceptance Criteria

### Functional Requirements

- [ ] `bold.viewers.list()` returns all viewers
- [ ] `bold.viewers.get(id)` returns a single viewer by UUID
- [ ] `bold.viewers.create(data)` creates a new viewer with name (required) and optional fields
- [ ] `bold.viewers.update(id, data)` updates viewer fields (traits replaced, not merged)
- [ ] `bold.viewers.listProgress(viewerId)` returns all progress for a viewer
- [ ] `bold.viewers.listProgress(viewerId, { completed: true })` filters by completion
- [ ] `bold.viewers.listProgress(viewerId, { collectionId })` filters by collection
- [ ] `bold.viewers.getProgress(viewerId, videoId)` returns progress for a video
- [ ] `bold.viewers.saveProgress(viewerId, videoId, data)` creates or updates progress

### Non-Functional Requirements

- [ ] All responses are camelCased (consistent with existing SDK)
- [ ] Request bodies use snake_case for API compatibility (manual transformation)
- [ ] Trait keys are preserved as-is (not transformed)
- [ ] TypeScript types are accurate and exported
- [ ] Errors include descriptive messages with context
- [ ] No new runtime dependencies added
- [ ] Follows existing `fetchers.ts` pattern

### Quality Gates

- [ ] `pnpm run lint` passes
- [ ] `pnpm run build` succeeds
- [ ] Types are correctly exported and usable by consumers

## Example Usage

```typescript
import { createClient } from '@boldvideo/bold-js';

const bold = createClient('your-api-key');

// 1. Create viewer when user signs up
const { viewer } = await bold.viewers.create({
  name: 'John Doe',
  externalId: 'user_123',
  email: 'john@example.com',
  traits: { plan: 'pro', company: 'Acme Inc' }
});

// 2. Track progress as video plays (call every 5-10 seconds)
await bold.viewers.saveProgress(viewer.id, 'video-id', {
  currentTime: 120,
  duration: 600
});

// 3. Mark video complete by setting currentTime = duration
await bold.viewers.saveProgress(viewer.id, 'video-id', {
  currentTime: 600,
  duration: 600
});

// 4. Get course progress
const { progress, meta } = await bold.viewers.listProgress(viewer.id, {
  collectionId: 'course-collection-id'
});
console.log(`Completed ${meta.completed} of ${meta.total} videos`);
```

## Summary of Changes from Original Plan

| Original | Revised | Reason |
|----------|---------|--------|
| `viewers.progress.list()` nested | `viewers.listProgress()` flat | Reviewer consensus: flat is better |
| `ViewerResponse`, `ViewersResponse` types | Inline `{ viewer: Viewer }` | Match existing `Response<T>` pattern |
| `snakeize.ts` utility file | Manual snake_case in request bodies | Simpler, avoid new abstraction |
| 11 methods | 7 methods | YAGNI: defer delete, lookup, completeProgress |
| ~290 lines | ~120 lines | 60% reduction per simplicity review |
| Factory pattern (`createViewers`) | Curried functions | Match `fetchers.ts` pattern |

## References

- Client factory: `/src/lib/client.ts`
- Existing fetchers: `/src/lib/fetchers.ts`
- Type definitions: `/src/lib/types.ts`
- API Documentation: `notes/bold/viewers-api.md`
