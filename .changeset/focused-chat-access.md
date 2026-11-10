---
"@boldvideo/bold-js": minor
---

Add video focus, collection access, viewer context, synthesis and plural collection filters to AI chat requests. Prefer the library chat route when focus is supplied while preserving legacy video-only routing. Type focus, pointers, locked matches and existing library events with camelCase payloads, and preserve opaque citation-map identifiers in streaming and JSON responses.

Keep AIResponse as an answer interface with required content and usage. Non-streaming chat with synthesize: false returns the separate AIRetrievalResponse type without answer content or synthesis usage.

Opt-in focus/access answers use AIChatResponse to preserve nullable usage and the server's input/output or prompt/completion token fields without changing legacy answer consumers. Match nullable pointer URLs and expose focus/access metadata in conversation history.
