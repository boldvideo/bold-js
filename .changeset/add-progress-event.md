---
"@boldvideo/bold-js": minor
---

Add `progress` event type to AI streaming events

New SSE event `{ type: "progress", stage: string, message: string }` streams between `message_start` and `sources`, providing persona-voiced status updates during AI processing. Stages include `planning`, `searching`, `reading`, and `synthesizing`. Fully backwards-compatible — clients that don't handle it will simply ignore it.
