---
"@boldvideo/bold-js": minor
---

Add conversation context support to AI Search

- Added `context` parameter to `SearchOptions` for passing conversation history
- Added `context` field to `AIResponse` for receiving updated conversation context
- Added `AIContextMessage` type for type-safe context messages
- Updated README with multi-turn conversation example

Usage:
```typescript
const first = await bold.ai.search({ prompt: "How do designers find clients?", stream: false });
const followUp = await bold.ai.search({
  prompt: "What about cold outreach?",
  context: first.context,
  stream: false
});
```
