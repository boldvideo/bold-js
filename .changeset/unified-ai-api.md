---
"@boldvideo/bold-js": major
---

Breaking: Unified AI API

- New methods: `bold.ai.ask()`, `bold.ai.search()`, `bold.ai.chat(videoId, opts)`
- `bold.ai.coach()` is now an alias for `bold.ai.ask()`
- New parameter: `prompt` replaces `message`
- New parameter: `stream` (boolean, default: true) for non-streaming responses
- New event types: `message_start`, `text_delta`, `sources`, `message_complete`
- New types: `AIEvent`, `AIResponse`, `Source`, `AIUsage`, `SearchOptions`, `ChatOptions`
- Removed: `CoachEvent`, `Citation`, `Usage`, `CoachOptions` (old `AskOptions`)
