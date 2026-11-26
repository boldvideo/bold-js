---
"@boldvideo/bold-js": minor
---

Add AbortSignal support to AI chat, ask, coach, and search in streaming and JSON modes. Aborting preserves the native AbortError. Exiting stream iteration early now cancels the response body and closes the upstream request.
