---
"@boldvideo/bold-js": minor
---

Add missing SSE event types and fix streaming termination

- Add `token`, `answer`, and `complete` event types to the `AIEvent` type union
- Add `AnswerMetadata` interface for answer event metadata
- Fix AsyncIterable not signaling completion: now terminates on `complete` event in addition to `message_complete` and `error`
- Add error logging for malformed SSE JSON to aid debugging
