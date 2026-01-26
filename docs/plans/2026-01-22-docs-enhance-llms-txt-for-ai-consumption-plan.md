---
title: "docs: Enhance llms.txt for AI consumption"
type: docs
date: 2026-01-22
---

# docs: Enhance llms.txt for AI consumption

## Overview

Rewrite the existing `llms.txt` file to be crystal clear for LLMs to understand and use the Bold JS SDK. The current file (121 lines) covers basics but lacks critical information LLMs need to generate correct code.

## Problem Statement / Motivation

LLMs reading the current `llms.txt` will generate broken code because:

1. **Missing `{ data: T }` wrapper** - Content methods return `{ data: Video[] }`, not `Video[]`. Every generated code snippet will fail to access data.
2. **Incomplete AIEvent types** - Only `text_delta` shown; 5 other event types undocumented
3. **No error handling guidance** - LLMs cannot generate production-ready code
4. **`getConversation()` missing** - Multi-turn conversation flow incomplete
5. **Segment type absent** - Cannot work with sources/citations correctly
6. **Browser-only tracking undocumented** - Node.js users will hit runtime errors

The llmstxt.org specification recommends keeping files under 10KB while being comprehensive. Our current file is ~4KB with significant gaps.

## Proposed Solution

Rewrite `llms.txt` to ~8KB with these sections:

1. **Header** - SDK name, purpose, installation
2. **Quick Start** - Working example showing `{ data }` destructuring
3. **Client Configuration** - `createClient()` with `ClientOptions`
4. **Content Methods** - Videos, Playlists, Settings with return types
5. **AI Methods** - All methods including `getConversation()`
6. **AI Streaming** - Complete `AIEvent` union with all 6 types
7. **Core Types** - `Video`, `Segment`, `Recommendation` inline
8. **Error Handling** - HTTP errors, streaming errors, common issues
9. **Analytics** - Browser-only warning, supported events
10. **Links** - GitHub, npm, API docs

## Technical Approach

### File Structure

```
llms.txt (~8KB)
├── # Bold Video JavaScript SDK (H1)
├── ## Installation
├── ## Quick Start (with correct { data } pattern)
├── ## Client Configuration
│   ├── createClient(apiKey, options?)
│   └── ClientOptions type inline
├── ## Content Methods
│   ├── bold.settings()
│   ├── bold.videos.list(limit?)
│   ├── bold.videos.get(id)  // Note: accepts ID or slug
│   ├── bold.videos.search(query)
│   ├── bold.playlists.list()
│   └── bold.playlists.get(id)
├── ## AI Methods
│   ├── bold.ai.chat(options)
│   ├── bold.ai.search(options)
│   ├── bold.ai.recommendations(options)
│   ├── bold.ai.getConversation(id)  // NEW
│   └── Deprecated aliases note
├── ## AI Streaming Events (AIEvent)
│   ├── message_start
│   ├── sources
│   ├── text_delta
│   ├── recommendations
│   ├── message_complete
│   └── error
├── ## AI Options
│   ├── ChatOptions
│   ├── SearchOptions
│   └── RecommendationsOptions
├── ## Core Types
│   ├── Video (inline definition)
│   ├── Segment (inline definition)
│   ├── Recommendation (inline definition)
│   └── Others listed by name
├── ## Error Handling
│   ├── HTTP Errors (401, 403, 429, 500)
│   ├── Streaming Errors (AIEvent error type)
│   └── Common Issues
├── ## Analytics (Browser Only)
│   ├── trackEvent(video, event)
│   └── trackPageView(title)
└── ## Links
```

### Key Changes

| Section | Current | Enhanced |
|---------|---------|----------|
| Quick Start | `await bold.videos.list()` | `const { data } = await bold.videos.list()` |
| AI Methods | 3 methods | 4 methods (add `getConversation`) |
| AIEvent | Mentioned | Full 6-type union with fields |
| Types | Listed names | Video, Segment, Recommendation inline |
| Errors | None | HTTP codes + streaming errors |
| Analytics | 2 lines | Browser-only warning + details |

## Acceptance Criteria

### Content Requirements

- [x] Quick Start shows `{ data }` destructuring pattern
- [x] `ClientOptions` type shown with `baseURL`, `debug`, `headers`
- [x] `videos.get(id)` documents ID or slug acceptance
- [x] `videos.list(limit?)` shows optional limit parameter
- [x] `getConversation(id)` documented under AI Methods
- [x] All 6 AIEvent types shown with their fields
- [x] `Segment` type shown inline (replaces deprecated `Source`)
- [x] Error handling section with HTTP codes and streaming errors
- [x] Analytics section marked "Browser Only"
- [x] File size under 10KB (actual: 6.6KB)

### Code Examples Must Work

- [x] Client initialization compiles
- [x] Video listing with `{ data }` works
- [x] AI streaming loop handles all event types
- [x] Error handling pattern catches both sync and async errors

### Format Requirements

- [x] Follows llmstxt.org Markdown conventions
- [x] H1 title, H2 sections, H3 subsections
- [x] Code blocks with `typescript` syntax highlighting
- [x] Consistent terminology (use "Segment" not "Source")

## Success Metrics

1. **LLM Code Generation Accuracy** - Generated code runs without immediate type/property errors
2. **File Size** - Under 10KB (target: ~8KB)
3. **Section Coverage** - All 10 planned sections present
4. **Zero Missing Criticals** - No undocumented critical paths

## Dependencies & Risks

### Dependencies
- None - this is documentation only

### Risks
| Risk | Mitigation |
|------|------------|
| File too large (>10KB) | Keep types minimal; link to types.ts for full definitions |
| Breaking existing LLM workflows | Maintain same structure/sections; additions only |
| Missing edge cases | SpecFlow analysis identified gaps; review against it |

## Implementation Checklist

### llms.txt

```markdown
# Bold Video JavaScript SDK

> TypeScript client for the Bold Video API. Fetch videos, playlists, settings. Stream AI responses. Track analytics.

## Installation

npm install @boldvideo/bold-js

## Quick Start

import { createClient } from '@boldvideo/bold-js';

const bold = createClient('your-api-key');

// Content methods return { data: T }
const { data: videos } = await bold.videos.list();
const { data: video } = await bold.videos.get('video-id-or-slug');

// AI streaming (default)
const stream = await bold.ai.chat({ prompt: 'How do I price my SaaS?' });
for await (const event of stream) {
  switch (event.type) {
    case 'text_delta': process.stdout.write(event.delta); break;
    case 'sources': console.log('Found:', event.sources.length); break;
    case 'message_complete': console.log('Done:', event.conversationId); break;
    case 'error': console.error(event.message); break;
  }
}

// AI non-streaming
const response = await bold.ai.recommendations({
  topics: ['sales', 'negotiation'],
  stream: false
});
console.log(response.guidance);

## Client Configuration

createClient(apiKey: string, options?: ClientOptions)

interface ClientOptions {
  baseURL?: string;              // Default: 'https://app.boldvideo.io/api/v1/'
  debug?: boolean;               // Log requests (default: false)
  headers?: Record<string, string>; // Additional headers
}

## Content Methods

All content methods return Promise<{ data: T }>.

- bold.settings(videoLimit?) - Channel settings, menus, featured playlists
- bold.videos.list(limit?) - List videos (default: 12)
- bold.videos.get(id) - Get video by ID or slug
- bold.videos.search(query) - Search videos
- bold.playlists.list() - List playlists
- bold.playlists.get(id) - Get playlist with videos

## AI Methods

All AI methods return AsyncIterable<AIEvent> (streaming) or Promise<AIResponse> (non-streaming).
Default is streaming (stream: true).

- bold.ai.chat(options: ChatOptions) - Conversational Q&A (library-wide or video-scoped)
- bold.ai.search(options: SearchOptions) - Semantic search with AI summary
- bold.ai.recommendations(options: RecommendationsOptions) - Topic-based video recommendations
- bold.ai.getConversation(id: string) - Retrieve conversation history by ID

Deprecated aliases (still work):
- bold.ai.ask() -> use chat()
- bold.ai.coach() -> use chat()
- bold.ai.recommend() -> use recommendations()

## AI Streaming Events

type AIEvent =
  | { type: "message_start"; conversationId?: string; videoId?: string }
  | { type: "sources"; sources: Segment[] }
  | { type: "text_delta"; delta: string }
  | { type: "recommendations"; recommendations: Recommendation[] }
  | { type: "message_complete";
      conversationId?: string;
      content: string;
      citations: Segment[];
      responseType: "answer" | "clarification";
      usage?: AIUsage;
      context?: AIContextMessage[];
      recommendations?: Recommendation[];
      guidance?: string }
  | { type: "error"; code: string; message: string; retryable: boolean }

## AI Options

### ChatOptions
{
  prompt: string;              // Required
  stream?: boolean;            // Default: true
  videoId?: string;            // Scope to specific video
  currentTime?: number;        // Playback position (with videoId)
  conversationId?: string;     // Continue conversation
  collectionId?: string;       // Filter to collection
  tags?: string[];             // Filter by tags
}

### SearchOptions
{
  prompt: string;              // Required
  stream?: boolean;            // Default: true
  limit?: number;              // Max results
  collectionId?: string;
  videoId?: string;            // Search within video
  tags?: string[];
  context?: AIContextMessage[];
}

### RecommendationsOptions
{
  topics: string[];            // Required (max: 10)
  stream?: boolean;            // Default: true
  limit?: number;              // Max per topic (default: 5, max: 20)
  collectionId?: string;
  tags?: string[];
  includeGuidance?: boolean;   // Default: true
  context?: AIContextMessage[];
}

## Core Types

### Video
{
  id: string;
  slug?: string;
  title: string;
  description: string | null;
  duration: number;
  publishedAt: string;
  playbackId: string;
  streamUrl: string;
  thumbnail: string;
  tags?: string[];
  metaData: { title: string; description: string; image: string | null };
  chapters?: string;
  attachments?: VideoAttachment[];
  transcript?: { text: string; json: any };
}

### Segment (for sources/citations)
{
  id: string;
  videoId: string;
  title: string;
  text: string;              // Transcript excerpt
  timestamp: number;         // Start seconds
  timestampEnd: number;      // End seconds
  playbackId: string;
  speaker?: string;
  cited?: boolean;
}

### Recommendation
{
  topic: string;
  videos: Array<{
    videoId: string;
    title: string;
    playbackId: string;
    relevance: number;
    reason: string;
  }>;
}

### Other types exported
Playlist, Settings, Portal, MenuItem, AIResponse, AIUsage, AIContextMessage,
Conversation, ConversationMessage, RecommendationsResponse

## Error Handling

### HTTP Errors
SDK throws on non-2xx responses:
- 401: Invalid API key
- 403: Forbidden (check permissions)
- 429: Rate limited (retry with backoff)
- 500: Server error (retry)

try {
  const { data } = await bold.videos.list();
} catch (error) {
  if (error.response?.status === 401) {
    console.error('Invalid API key');
  }
}

### Streaming Errors
Handle error events in stream:

for await (const event of stream) {
  if (event.type === 'error') {
    console.error(`[${event.code}] ${event.message}`);
    if (event.retryable) { /* retry logic */ }
  }
}

## Analytics (Browser Only)

These methods require browser globals (window, document, navigator).
Do not use in Node.js.

- bold.trackEvent(video, event) - Track video playback
  video: { id, title, duration }
  event: DOM Event (play, pause, timeupdate, loadedmetadata)
  Note: timeupdate throttled to 5 seconds

- bold.trackPageView(title: string) - Track page views

## Links

- GitHub: https://github.com/boldvideo/bold-js
- npm: https://www.npmjs.com/package/@boldvideo/bold-js
- API Docs: https://docs.boldvideo.io/docs/api
- Types: https://github.com/boldvideo/bold-js/blob/main/src/lib/types.ts
```

## References & Research

### Internal References
- Current llms.txt: `/llms.txt`
- Types source: `/src/lib/types.ts`
- Client factory: `/src/lib/client.ts`
- AI methods: `/src/lib/ai.ts`
- README: `/README.md`

### External References
- [llmstxt.org specification](https://llmstxt.org/) - Official format guide
- [llms.txt Best Practices (Rankability)](https://www.rankability.com/guides/llms-txt-best-practices/) - Implementation guide
- [Mintlify llms.txt](https://www.mintlify.com/blog/simplifying-docs-with-llms-txt) - Platform adoption examples

### Industry Adoption
- Over 844,000 websites use llms.txt (BuiltWith, Oct 2025)
- Anthropic, Cloudflare, Stripe all use this format
