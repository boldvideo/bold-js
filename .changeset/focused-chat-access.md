---
"@boldvideo/bold-js": minor
---

Add video focus, collection access, viewer context, synthesis and plural collection filters to AI chat requests. Prefer the library chat route when focus is supplied while preserving legacy video-only routing. Type focus, pointers, locked matches and existing library events with camelCase payloads, and preserve opaque citation-map identifiers in streaming and JSON responses.

Keep AIResponse as an answer interface with required content, usage and sources: Segment[]. Non-streaming chat with synthesize: false returns the separate AIRetrievalResponse type without answer content or synthesis usage.

Opt-in focus/access answers use AIChatResponse with sources: AISource[] to preserve minimal or nullable source metadata, nullable usage and the server's input/output or prompt/completion token fields without changing legacy non-opt-in JSON answer consumers. SSE events and conversation history also use AISource[]; consumers assuming every source is a Segment must check property presence and nullable fields. Match nullable pointer URLs and expose focus/access metadata in conversation history.

Add optional viewer, access and focus options to getConversation for verified-access history requests, preserving the existing one-argument open-mode call and explicit empty grants. Expose server code/retryable details on AIAPIError while retaining HTTP status fallbacks. Document open versus gated tenants, server-only credentials, per-request authorization scope, conversation restart requirements and focused playback position.
