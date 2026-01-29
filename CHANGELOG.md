# @boldvideo/bold-js

## 1.17.0

### Minor Changes

- 563730d: Add full options support to `videos.list()` for tag, collectionId, viewerId, and page filtering

  **New features:**

  - Filter videos by `tag` and `collectionId` on both endpoints
  - Include watch progress with `viewerId` parameter
  - Access paginated `/videos` endpoint using `page` parameter

  **Usage:**

  ```typescript
  // Latest videos with filters
  await bold.videos.list({ limit: 20, tag: "sales", collectionId: "col_123" });

  // Include viewer watch progress
  await bold.videos.list({ limit: 20, viewerId: "viewer_123" });

  // Paginated index (uses /videos endpoint)
  await bold.videos.list({ page: 2, tag: "sales" });
  ```

  **Breaking:** None. Existing `bold.videos.list()` and `bold.videos.list(12)` calls work unchanged.

## 1.16.0

### Minor Changes

- 06c8abc: Add Viewers API for managing external users and tracking video progress

  New methods on the `viewers` namespace:

  - `viewers.list()` - List all viewers
  - `viewers.get(id)` - Get a viewer by ID
  - `viewers.lookup({ externalId } | { email })` - Find viewer by external ID or email
  - `viewers.create(data)` - Create a new viewer
  - `viewers.update(id, data)` - Update a viewer
  - `viewers.listProgress(viewerId, options?)` - List progress for a viewer
  - `viewers.getProgress(viewerId, videoId)` - Get progress for a video
  - `viewers.saveProgress(viewerId, videoId, data)` - Save/update progress

  Also fixes `camelizeKeys` to preserve user-defined trait keys (e.g., `company_name` stays as-is instead of becoming `companyName`).

## 1.15.2

### Patch Changes

- e35a6d4: Enhanced llms.txt for better AI/LLM consumption

  - Added `{ data: T }` return type pattern to Quick Start examples
  - Documented `ClientOptions` type with all configuration options
  - Added `getConversation()` method to AI Methods section
  - Included complete `AIEvent` union type with all 6 event types
  - Added inline definitions for `Video`, `Segment`, and `Recommendation` types
  - New Error Handling section covering HTTP errors and streaming errors
  - Marked Analytics section as "Browser Only" with usage details
  - Documented that `videos.get(id)` accepts both ID and slug

## 1.15.1

### Patch Changes

- d8a142c: Add `chatDisclaimer` field to Settings type for displaying custom disclaimer text in the chat interface.

## 1.15.0

### Minor Changes

- d7e0675: Add `bold.ai.getConversation(conversationId)` method to fetch conversation history by ID. Returns the full conversation including messages, metadata, and timestamps.

## 1.14.0

### Minor Changes

- 4bfba45: Add Portal analytics and custom redirects support

  - Add `analyticsProvider` and `analyticsId` fields to Portal type for Plausible, GA4, and Fathom integrations
  - Add `customRedirects` field to Portal type for custom redirect configuration
  - Export new types: `AnalyticsProvider`, `CustomRedirect`

## 1.13.0

### Minor Changes

- 4030a6e: Add portal hero configuration and menu item blank property

  - Added `portal.hero` configuration with `type: 'none' | 'custom'` to control hero section display
  - Added `blank` property to `MenuItem` type for opening links in new windows/tabs
  - Updated `MenuItem.icon` to allow `null` values

## 1.12.0

### Minor Changes

- ccd71c9: Add slug field to Video type

## 1.11.1

### Patch Changes

- 0428b78: Add `cited` boolean field to Segment type for stable citation ordering

## 1.11.0

### Minor Changes

- 88c5d1c: Remove deprecated SSE event types and add Segment type

  **Breaking changes to `AIEvent` type:**

  - Remove deprecated event types: `token`, `clarification`, `answer`, `complete`
  - Remove `AnswerMetadata` interface
  - Change `message_complete` event: `sources` field renamed to `citations`, added `responseType: "answer" | "clarification"`

  **New exports:**

  - `Segment` - Primary type for video segments (replaces Source)
  - `Citation` - Semantic alias for Segment (for cited chunks)
  - `Source` - Now a deprecated alias for Segment (kept for backwards compatibility)

  This aligns the SDK with the simplified backend SSE event structure.

## 1.10.0

### Minor Changes

- a9402d1: Add missing SSE event types and fix streaming termination

  - Add `token`, `answer`, and `complete` event types to the `AIEvent` type union
  - Add `AnswerMetadata` interface for answer event metadata
  - Fix AsyncIterable not signaling completion: now terminates on `complete` event in addition to `message_complete` and `error`
  - Add error logging for malformed SSE JSON to aid debugging

## 1.9.0

### Minor Changes

- ff2f021: Transform all API responses to use camelCase (TypeScript/JavaScript convention)

  **Breaking Changes:**

  All response types now use camelCase consistently across the entire SDK:

  - **Videos**: `playback_id` → `playbackId`, `published_at` → `publishedAt`, `stream_url` → `streamUrl`, `meta_data` → `metaData`, `captions_label` → `captionsLabel`, `download_urls` → `downloadUrls`, etc.
  - **Playlists**: `is_private` → `isPrivate`
  - **Settings**: `featured_playlists` → `featuredPlaylists`, `menu_items` → `menuItems`, `theme_config` → `themeConfig`, `ai_avatar` → `aiAvatar`, `logo_url` → `logoUrl`, etc.
  - **Portal/Theme**: `show_chapters` → `showChapters`, `font_body` → `fontBody`, `color_scheme` → `colorScheme`, `css_overrides` → `cssOverrides`, etc.
  - **AI responses**: (already camelCase in v1.8.0)

  **Internal:**

  - Applied `camelizeKeys()` transformation in `fetchers.ts` at the transport boundary
  - Updated all type definitions in `types.ts` to use camelCase

## 1.8.0

### Minor Changes

- 065d7ea: Transform all API responses to use camelCase (TypeScript/JavaScript convention)

  **Breaking Changes:**

  - **All response types now use camelCase** (was snake_case). API responses are transformed at the SDK boundary.
    - `video_id` → `videoId`
    - `timestamp_end` → `timestampEnd`
    - `playback_id` → `playbackId`
    - `input_tokens` → `inputTokens`
    - `conversation_id` → `conversationId`

  **Internal:**

  - Added `camelizeKeys` utility for deep snake_case → camelCase transformation
  - Applied transformation in `jsonRequest()` and `parseSSE()` at the transport boundary

## 1.7.0

### Minor Changes

- e6fb51b: Align SDK with Bold AI API v1 specification

  **Breaking Changes:**

  - Video-scoped chat: pass `videoId` in options instead of as separate arg: `bold.ai.chat({ videoId, prompt })`
  - `Source.timestamp_end` and `Source.playback_id` are now required (were optional)
  - `AIUsage` now uses `input_tokens`/`output_tokens` (was `prompt_tokens`/`completion_tokens`/`total_tokens`)
  - Removed `TopicInput` type - `RecommendationsOptions.topics` now only accepts `string[]`
  - `RecommendationsOptions.context` is now `AIContextMessage[]` (was `string`)

  **New:**

  - `bold.ai.chat(opts)` - Single method for all chat (pass `videoId` to scope to a video)
  - `bold.ai.recommendations(opts)` - AI-powered video recommendations (replaces `recommend`)
  - `ChatOptions.videoId` - Scope chat to a specific video
  - `ChatOptions.currentTime` - Pass current playback position for context

  **Deprecated (still work, will be removed in v2):**

  - `bold.ai.ask()` → use `bold.ai.chat()`
  - `bold.ai.coach()` → use `bold.ai.chat()`
  - `bold.ai.recommend()` → use `bold.ai.recommendations()`
  - `AskOptions` type → use `ChatOptions`
  - `RecommendOptions` type → use `RecommendationsOptions`
  - `RecommendResponse` type → use `RecommendationsResponse`

  **Type Changes:**

  - Added `Source.id` field (chunk identifier)
  - Added `conversation_id` and `video_id` to `message_start` event
  - Added `conversation_id`, `recommendations`, `guidance` to `message_complete` event
  - Simplified `clarification` event to include `content` field
  - Removed legacy event types: `token`, `answer`, `complete`

## 1.6.1

### Patch Changes

- 7aff057: Align SDK with API specification

  - Renamed `synthesize` to `includeGuidance` in `RecommendOptions` to match API
  - Renamed `why` to `reason` in `RecommendationVideo` type to match API response
  - Added `tags` filter to `AskOptions` and `SearchOptions`
  - Added `currentTime` to `ChatOptions` for playback context

## 1.6.0

### Minor Changes

- 71b3437: Add `bold.ai.recommend()` for AI-powered video recommendations

  - New method `bold.ai.recommend({ topics, ...options })` returns personalized video recommendations based on topics
  - Supports both streaming (default) and non-streaming modes
  - Includes AI-generated guidance for learning paths
  - New types: `RecommendOptions`, `RecommendResponse`, `Recommendation`, `RecommendationVideo`, `TopicInput`
  - New `recommendations` event type in `AIEvent` union for streaming responses

## 1.5.1

### Patch Changes

- 21267d9: Fix SSE parsing to process final 'complete' event when stream closes without trailing newline

## 1.5.0

### Minor Changes

- c86e99c: Add conversation context support to AI Search

  - Added `context` parameter to `SearchOptions` for passing conversation history
  - Added `context` field to `AIResponse` for receiving updated conversation context
  - Added `AIContextMessage` type for type-safe context messages
  - Updated README with multi-turn conversation example

  Usage:

  ```typescript
  const first = await bold.ai.search({
    prompt: "How do designers find clients?",
    stream: false,
  });
  const followUp = await bold.ai.search({
    prompt: "What about cold outreach?",
    context: first.context,
    stream: false,
  });
  ```

### Patch Changes

- c961807: Fix AI search SSE stream termination: wait for 'complete' event instead of closing on 'message_complete'

  - Added missing event types to AIEvent union: complete, token, answer
  - Fixed parseSSE to terminate on 'complete' or 'error' events
  - Added optional fields to match backend spec (query, context, response_id)

## 1.4.0

### Minor Changes

- 3b65bbf: Add conversation context support to AI Search

  - Added `context` parameter to `SearchOptions` for passing conversation history
  - Added `context` field to `AIResponse` for receiving updated conversation context
  - Added `AIContextMessage` type for type-safe context messages
  - Updated README with multi-turn conversation example

  Usage:

  ```typescript
  const first = await bold.ai.search({
    prompt: "How do designers find clients?",
    stream: false,
  });
  const followUp = await bold.ai.search({
    prompt: "What about cold outreach?",
    context: first.context,
    stream: false,
  });
  ```

## 1.3.0

### Minor Changes

- 57c4de2: Add missing fields to PortalTheme type: `logo_dark_url` for dark mode logos and `css_overrides` for custom CSS injection.

## 1.2.0

### Minor Changes

- 20f21be: Add consolidated theme fields to PortalTheme type: `header_size`, `layout`, `radius`, `color_scheme`, `light`, and `dark` OKLCH tokens. This aligns the SDK with the updated Settings API where theme configuration is now included directly in `portal.theme`.

## 1.1.1

### Patch Changes

- 7bd10c4: Fix ThemeColors type: changed `accent-foreground` and `muted-foreground` properties to use underscores (`accent_foreground`, `muted_foreground`) to match the API response format

## 1.1.0

### Minor Changes

- 44c1a4f: Simplify ThemeColors type to match new 9-token backend theme system (BOLD-919)

  **ThemeColors changes:**

  - Added: `accent`, `accent-foreground`, `surface`
  - Removed: `card`, `card-foreground`, `destructive`, `destructive-foreground`, `input`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`

  **ThemeConfig changes:**

  - Added: `color_scheme` field (`"toggle" | "light" | "dark"`)

  This aligns the SDK types with the backend's dynamically derived OKLCH theme tokens (BOLD-921).

## 1.0.1

### Patch Changes

- 844d6f1: Add persona and ai_search types to Account settings

  - Added `Persona` type (discriminated union based on `enabled` flag)
  - Added `AccountAISearch` type with `enabled` boolean
  - Updated `Account` type to include `ai_search` and `persona` fields

## 1.0.0

### Major Changes

- 8afb7b3: Breaking: Unified AI API

  - New methods: `bold.ai.ask()`, `bold.ai.search()`, `bold.ai.chat(videoId, opts)`
  - `bold.ai.coach()` is now an alias for `bold.ai.ask()`
  - New parameter: `prompt` replaces `message`
  - New parameter: `stream` (boolean, default: true) for non-streaming responses
  - New event types: `message_start`, `text_delta`, `sources`, `message_complete`
  - New types: `AIEvent`, `AIResponse`, `Source`, `AIUsage`, `SearchOptions`, `ChatOptions`
  - Removed: `CoachEvent`, `Citation`, `Usage`, `CoachOptions` (old `AskOptions`)

## 0.9.0

### Minor Changes

- fa0d80f: refactor: Align Citation type with backend Video schema

  **BREAKING CHANGE**: The `Citation` interface has been restructured to match the backend API changes.

  **Before:**

  ```typescript
  interface Citation {
    video_id: string;
    title: string;
    timestamp_ms: number;
    text: string;
  }
  ```

  **After:**

  ```typescript
  interface Citation {
    video: Pick<Video, "internal_id" | "title" | "playback_id">;
    start_ms: number;
    end_ms: number;
    text: string;
  }
  ```

  Migration:

  - `citation.video_id` → `citation.video.internal_id`
  - `citation.title` → `citation.video.title`
  - `citation.timestamp_ms` → `citation.start_ms`
  - New: `citation.video.playback_id` and `citation.end_ms`

## 0.8.2

### Patch Changes

- e8876a9: Fix release workflow to build dist files before publishing

## 0.8.1

### Patch Changes

- c643c04: Fix missing compiled dist files in published package

## 0.8.0

### Minor Changes

- b0c770d: Add streaming AI endpoints

  - `bold.ai.coach()` - Library-wide RAG assistant with conversation support
  - `bold.ai.ask()` - Video-specific Q&A

  Both return `AsyncIterable<CoachEvent>` for type-safe streaming. New types: `CoachEvent`, `CoachOptions`, `AskOptions`, `Citation`, `Usage`.

  Also includes:

  - Custom headers support via `createClient(key, { headers })`
  - Exported `DEFAULT_API_BASE_URL` constant

## 0.7.1

### Patch Changes

- Fix: Add thoughts directory to .npmignore to prevent publishing internal planning files

## 0.7.0

### Minor Changes

- Add `color_scheme` field to Portal type (BOLD-759)

  Added optional `color_scheme` field to the Portal type to support theme configuration:

  - `'toggle'`: Show theme toggle, allow user to switch between light/dark
  - `'light'`: Force light mode, hide theme toggle
  - `'dark'`: Force dark mode, hide theme toggle

  This field is already returned by the API and consumed by the Next.js starter. The type definition now matches the API response.

## 0.6.1

### Patch Changes

- Fix missing compiled dist files in published package by adding .npmignore

## 0.6.0

### Minor Changes

- Add complete type definitions for Settings and Video API responses

  **Settings updates:**

  - Add `portal` object with display, layout, navigation, and theme settings
  - Add `portal.navigation.show_header` field (BOLD-687)
  - Add `account` object with nested AI configuration
  - Add top-level fields: `favicon_url`, `logo_dark_url`, `logo_url`, `version`
  - Add `theme_config` with dark/light theme definitions
  - Expand `meta_data` to include `social_graph_image_url`
  - Maintain backward compatibility with flat AI fields

  **Video updates:**

  - Add missing fields: `chapters`, `attachments`, `download_urls`, `transcript`
  - Add `internal_id`, `playback_speed`, `subtitles`, `tags`, `cta`
  - Fix `meta_data` type from array to object
  - Replace incorrect `transcription` field with correct `transcript` field
  - Mark optional fields appropriately

## 0.5.0

### Minor Changes

- 111cb8f: feat: add ai_greeting property to Settings type

  Added optional ai_greeting property to the Settings type to allow customization of the AI assistant's greeting message. This maintains backward compatibility while enabling users to override the default greeting.

  Resolves #2

## 0.4.3

### Patch Changes

- New `has_ai` field to settings
