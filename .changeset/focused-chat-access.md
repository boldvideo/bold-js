---
"@boldvideo/bold-js": major
---

Add video focus, collection access, viewer context, synthesis and plural collection filters to AI chat requests. Prefer the library chat route when focus is supplied while preserving legacy video-only routing. Type focus, pointers, locked matches and existing library events with camelCase payloads, and preserve opaque citation-map identifiers in streaming and JSON responses.

Keep AIResponse as an answer interface with required content, usage and sources: Segment[]. Non-streaming chat with synthesize: false returns the separate AIRetrievalResponse type without answer content or synthesis usage.

Opt-in focus/access answers use AIChatResponse with sources: AISource[] to preserve minimal or nullable source metadata, nullable usage and the server's input/output or prompt/completion token fields without changing legacy non-opt-in JSON answer consumers. SSE events and conversation history also use AISource[]; consumers assuming every source is a Segment must check property presence and nullable fields. Expose optional nullable focus citation title, playback ID/token, slug and canonical/timestamp URLs. Match nullable pointer URLs and expose focus/access metadata in conversation history.

Breaking TypeScript change: existing SSE and conversation-history consumers can no longer treat every source as a Segment, even without opting into focus/access. Check property presence (for example, 'text' in source) and nullable metadata before rendering; use videoId/timestamp for minimal focus citations, and validate every required field before passing a source to a Segment-only component. Legacy non-opt-in JSON AIResponse consumers retain their required content, usage and Segment[] source contract.

Add optional viewer, access and focus options to getConversation for verified-access history requests, preserving the existing one-argument open-mode call and explicit empty grants. Expose server code/retryable details on AIAPIError while retaining HTTP status fallbacks. Document open versus gated tenants, server-only credentials, per-request authorization scope, conversation restart requirements and focused playback position.
