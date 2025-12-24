---
"@boldvideo/bold-js": minor
---

Transform all API responses to use camelCase (TypeScript/JavaScript convention)

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
