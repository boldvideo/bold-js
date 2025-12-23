---
"@boldvideo/bold-js": minor
---

Align SDK with Bold AI API v1 specification

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
