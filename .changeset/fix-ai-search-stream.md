---
"@boldvideo/bold-js": patch
---

Fix AI search SSE stream termination: wait for 'complete' event instead of closing on 'message_complete'

- Added missing event types to AIEvent union: complete, token, answer
- Fixed parseSSE to terminate on 'complete' or 'error' events
- Added optional fields to match backend spec (query, context, response_id)
