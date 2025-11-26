---
"@boldvideo/bold-js": minor
---

Add streaming AI endpoints

- `bold.ai.coach()` - Library-wide RAG assistant with conversation support
- `bold.ai.ask()` - Video-specific Q&A

Both return `AsyncIterable<CoachEvent>` for type-safe streaming. New types: `CoachEvent`, `CoachOptions`, `AskOptions`, `Citation`, `Usage`.

Also includes:
- Custom headers support via `createClient(key, { headers })`
- Exported `DEFAULT_API_BASE_URL` constant
