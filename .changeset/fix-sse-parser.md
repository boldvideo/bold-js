---
"@boldvideo/bold-js": patch
---

Fix SSE parser dropping events from multi-line event blocks

The `parseSSE` function checked if the entire event block started with `data:`, which failed when the server included an `event:` field before the `data:` field. This caused all streaming events except `message_start` to be silently dropped, hanging the stream indefinitely.

The parser now correctly splits each event block into individual lines and extracts the `data:` line from within the block.
