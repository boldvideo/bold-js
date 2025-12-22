<div align="center">
    <a href="https://boldvideo.com?utm_source=github.com&utm_medium=readme&utm_campaign=bold-js" align="center">
		<img src="https://boldvideo.com/bold-js-github-header.svg"  alt="Bold Logo">
	</a>
	<h1 align="center rainbow">@boldvideo/bold-js</h1>
    <p align="center">
        The JavaScript SDK for interacting with the <a href="https://boldvideo.com?utm_source=github.com&utm_medium=readme&utm_campaign=bold-js" target="_blank">Bold API</a>, to power your own business video platform.
    </p>
</div>

<p align="center">
  <a href="https://npmjs.com/package/@boldvideo/bold-js">
    <img src="https://img.shields.io/npm/v/@boldvideo/bold-js/latest.svg?style=flat-square" alt="Bold JS" />
  </a>
  <a href="https://npmjs.com/package/@boldvideo/bold-js" rel="nofollow">
    <img src="https://img.shields.io/npm/dt/@boldvideo/bold-js.svg?style=flat-square" alt="npm">
  </a>
</p>

<p align="center">
  <a href="https://twitter.com/intent/follow?screen_name=veryboldvideo">
    <img src="https://img.shields.io/badge/Follow-%40veryboldvideo-09b3af?style=appveyor&logo=twitter" alt="Follow @veryboldvideo" />
  </a>
  <a href="https://https://app.boldvideo.io/register?utm_source=github.com&utm_medium=readme&utm_campaign=bold-js">
    <img src="https://img.shields.io/badge/Try%20Bold-Free-09b3af?style=appveyor&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAmCAYAAADTGStiAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAGFSURBVHgBxZg9SwNBEIZ34xUpVLCwEQQRtRARxV+g4M8QLO0sBPtgZS129gr+AbEWWyshOUSCkipBjB8cBHPrM4GVQ84qZuaFJTebj+feyczu3fmxEIIbXjnjjZEy7hm3feeunfdPf33B/xO4TBk/fMoZHXMCHU1wVBP3m8Cb2mDRI/AN4K9xouJ0NA9ovzih5Vj0jutZXHcl0HIsmkicW4uBJtiR2kUr8KQJGPVMwJ62sgJ//hxrtROQNsvnDO30JbGaY9xeROggVnLcY/FYAPwcJ7Qc7xahKmAAe33vz0vmRysK6rASQs2FUC3Oq1U1xZVSWVukvCWxWlXjbgnYFc6nVMEiXK+wQx0MjhX346gPWmtOe5MQjQPdsQBLylctUi3gholjnE6bgFHVCpxZgR+s/uOGVTvdWLTTCyvXurpj3J7IfbOqY0BpLrcx3mea22Id6LZAJdYA56T3COhy8dFE4kYkHN7xcgnwDGD79/sJH6i54SQ1ItfLXZx1GC2CehmsqG96m37o1gSKagAAAABJRU5ErkJggg==" alt="Try Bold Video" />
  </a>
</p>

---

## Installation

```bash
npm install @boldvideo/bold-js
```

## Quick Start

```typescript
import { createClient } from '@boldvideo/bold-js';

const bold = createClient('your-api-key');

// Fetch videos
const videos = await bold.videos.list();

// Get AI-powered recommendations
const recs = await bold.ai.recommend({ 
  topics: ['sales', 'negotiation'],
  stream: false 
});
console.log(recs.guidance);
```

---

## API Reference

### Videos

```typescript
// List latest videos
const videos = await bold.videos.list();

// Get a single video
const video = await bold.videos.get('video-id');

// Search videos
const results = await bold.videos.search('pricing strategies');
```

### Playlists

```typescript
// List all playlists
const playlists = await bold.playlists.list();

// Get a single playlist with videos
const playlist = await bold.playlists.get('playlist-id');
```

### Settings

```typescript
// Fetch channel settings, menus, and featured playlists
const settings = await bold.settings();
```

---

## AI Methods

All AI methods support both streaming (default) and non-streaming modes.

### Recommend

Get AI-powered video recommendations based on topics — ideal for personalized learning paths, exam prep, and content discovery.

```typescript
// Streaming (default)
const stream = await bold.ai.recommend({ 
  topics: ['contract law', 'ethics', 'client management'],
  context: 'I failed these topics on my certification exam'
});

for await (const event of stream) {
  if (event.type === 'recommendations') {
    event.recommendations.forEach(rec => {
      console.log(`${rec.topic}:`);
      rec.videos.forEach(v => console.log(`  - ${v.title} (${v.relevance})`));
    });
  }
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta); // AI guidance
  }
}

// Non-streaming
const response = await bold.ai.recommend({ 
  topics: ['sales', 'marketing'],
  stream: false 
});
console.log(response.guidance);
console.log(response.recommendations);
```

**Options:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `topics` | `string[]` \| `string` | Topics to find content for (required) |
| `stream` | `boolean` | `true` (default) for SSE, `false` for JSON |
| `limit` | `number` | Max videos per topic (default: 5, max: 20) |
| `collectionId` | `string` | Filter to a specific collection |
| `tags` | `string[]` | Filter by tags |
| `includeGuidance` | `boolean` | Include AI learning path narrative (default: true) |
| `context` | `string` | User context for personalized guidance |

### Coach / Ask

Library-wide RAG assistant for answering questions across your entire video library.

```typescript
// Streaming
const stream = await bold.ai.coach({ prompt: 'How do I price my SaaS?' });

for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
  if (event.type === 'sources') console.log('Sources:', event.sources);
}

// Non-streaming
const response = await bold.ai.ask({ 
  prompt: 'What are the best closing techniques?',
  stream: false 
});
console.log(response.content);
```

### Search

Semantic search with light synthesis.

```typescript
const stream = await bold.ai.search({ 
  prompt: 'pricing strategies',
  limit: 10 
});

for await (const event of stream) {
  if (event.type === 'sources') {
    console.log(`Found ${event.sources.length} results`);
  }
}
```

### Chat

Video-scoped conversation for Q&A about a specific video.

```typescript
const stream = await bold.ai.chat('video-id', { 
  prompt: 'What is discussed at the 5 minute mark?' 
});

for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
}

// With playback context - helps AI understand what viewer just watched
const stream = await bold.ai.chat('video-id', { 
  prompt: 'What does she mean by that?',
  currentTime: 847  // seconds
});
```

### Multi-turn Conversations

Use the `context` parameter for follow-up questions:

```typescript
const first = await bold.ai.search({ 
  prompt: 'How do indie designers find clients?',
  stream: false 
});

const followUp = await bold.ai.search({
  prompt: 'What about cold outreach specifically?',
  context: first.context,
  stream: false
});
```

---

## Analytics

Track video events and page views for analytics.

```typescript
// Track video events (play, pause, complete, etc.)
bold.trackEvent({
  type: 'play',
  videoId: 'video-id',
  timestamp: 0
});

// Track page views
bold.trackPageView({
  path: '/videos/my-video',
  referrer: document.referrer
});
```

---

## TypeScript

All types are exported for full TypeScript support:

```typescript
import type { 
  Video, 
  Playlist, 
  Settings,
  AIEvent,
  AIResponse,
  RecommendOptions,
  RecommendResponse,
  Recommendation,
  Source
} from '@boldvideo/bold-js';
```

---

## Related Links

- **[Bold API Documentation](https://docs.boldvideo.io/docs/api)**
- **[GitHub Repository](https://github.com/boldvideo/bold-js)**
- **[npm Package](https://www.npmjs.com/package/@boldvideo/bold-js)**

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## Security

See [SECURITY.md](SECURITY.md) for security policies and reporting vulnerabilities.

## License

MIT
