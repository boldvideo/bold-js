# @boldvideo/bold-js

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
