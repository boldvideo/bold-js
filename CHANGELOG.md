# @boldvideo/bold-js

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
