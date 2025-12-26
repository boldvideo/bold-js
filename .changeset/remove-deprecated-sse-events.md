---
"@boldvideo/bold-js": minor
---

Remove deprecated SSE event types and add Segment type

**Breaking changes to `AIEvent` type:**

- Remove deprecated event types: `token`, `clarification`, `answer`, `complete`
- Remove `AnswerMetadata` interface
- Change `message_complete` event: `sources` field renamed to `citations`, added `responseType: "answer" | "clarification"`

**New exports:**

- `Segment` - Primary type for video segments (replaces Source)
- `Citation` - Semantic alias for Segment (for cited chunks)
- `Source` - Now a deprecated alias for Segment (kept for backwards compatibility)

This aligns the SDK with the simplified backend SSE event structure.
