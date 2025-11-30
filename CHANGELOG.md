# @boldvideo/bold-js

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
