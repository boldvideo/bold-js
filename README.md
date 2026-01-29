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

// AI-powered recommendations
const recs = await bold.ai.recommendations({ 
  topics: ['sales', 'negotiation'],
  stream: false 
});
console.log(recs.guidance);
```

---

## API Reference

### Videos

```typescript
// List latest videos (default: 12)
const videos = await bold.videos.list();

// With limit (backwards compatible)
const videos = await bold.videos.list(20);

// With filters
const videos = await bold.videos.list({ 
  limit: 20,
  tag: 'sales',
  collectionId: 'col_123',
  viewerId: 'viewer_123'  // Include watch progress
});

// Paginated index (uses /videos endpoint)
const videos = await bold.videos.list({ 
  page: 2,
  tag: 'sales',
  collectionId: 'col_123'
});

// Get a single video by ID or slug
const video = await bold.videos.get('video-id');
const videoBySlug = await bold.videos.get('my-video-slug');

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

// Access portal hero configuration
if (settings.portal.hero.type === 'custom') {
  // Render custom hero section
}

// Menu items with external link handling
settings.menuItems.forEach(item => {
  // item.blank: true opens in a new window/tab
  // item.isExt: true indicates an external URL
  // item.icon: optional icon path (can be null)
});
```

---

## Viewers API

Manage external users and track their video watch progress. Ideal for course platforms integrating with Bold Video.

### Viewer Management

```typescript
// Create a viewer (e.g., when user signs up)
const { data: viewer } = await bold.viewers.create({
  name: 'John Doe',
  externalId: 'user_123',  // Your platform's user ID
  email: 'john@example.com',
  traits: { plan: 'pro', company_name: 'Acme Inc' }
});

// Find viewer by external ID (common for syncing users)
const { data: viewer } = await bold.viewers.lookup({ externalId: 'user_123' });

// Or find by email
const { data: viewer } = await bold.viewers.lookup({ email: 'john@example.com' });

// Update viewer
await bold.viewers.update(viewer.id, { 
  traits: { plan: 'enterprise' }  // Note: traits are replaced, not merged
});

// List all viewers
const { data: viewers } = await bold.viewers.list();
```

### Progress Tracking

```typescript
// Save progress as video plays (call every 5-10 seconds)
await bold.viewers.saveProgress(viewerId, videoId, {
  currentTime: 120,  // seconds
  duration: 600      // total video duration
});

// Mark video complete by setting currentTime = duration
await bold.viewers.saveProgress(viewerId, videoId, {
  currentTime: 600,
  duration: 600
});

// Get progress for a specific video
const { data: progress } = await bold.viewers.getProgress(viewerId, videoId);
console.log(`${progress.percentage}% complete`);

// List all progress for a viewer (e.g., for a course dashboard)
const { data: progress, meta } = await bold.viewers.listProgress(viewerId, {
  collectionId: 'course-collection-id',  // Filter to a course
  completed: false  // Only in-progress videos
});
console.log(`Completed ${meta.completed} of ${meta.total} videos`);
```

---

## Community API

Build community features with posts, comments, and reactions. All write operations require a `viewerId` (the viewer performing the action).

### Posts

```typescript
// List posts (optionally filter by category)
const { data: posts } = await bold.community.posts.list({ 
  category: 'announcements',
  limit: 20,
  offset: 0,
  viewerId: 'viewer-uuid'  // Include viewerReacted in response
});

// Get a single post with comments
const { data: post } = await bold.community.posts.get('post-id', 'viewer-uuid');

// Create a post (requires viewerId)
const { data: newPost } = await bold.community.posts.create('viewer-uuid', {
  content: 'Hello community! **Markdown** supported.',
  category: 'general'
});

// Update a post (owner or admin only)
await bold.community.posts.update('viewer-uuid', 'post-id', {
  content: 'Updated content'
});

// Delete a post (owner or admin only)
await bold.community.posts.delete('viewer-uuid', 'post-id');

// React to a post (toggle like/unlike)
const reaction = await bold.community.posts.react('viewer-uuid', 'post-id');
console.log(reaction.reacted, reaction.reactionsCount);
```

### Comments

```typescript
// Create a comment on a post
const { data: comment } = await bold.community.comments.create(
  'viewer-uuid',
  'post-id',
  { content: 'Great post!' }
);

// Reply to a comment (nested)
const { data: reply } = await bold.community.comments.create(
  'viewer-uuid',
  'post-id',
  { content: 'I agree!', parentId: 'parent-comment-id' }
);

// Delete a comment (owner or admin only)
await bold.community.comments.delete('viewer-uuid', 'comment-id');

// React to a comment (toggle)
const reaction = await bold.community.comments.react('viewer-uuid', 'comment-id');
```

---

## AI Methods

All AI methods support both streaming (default) and non-streaming modes.

### Chat

Library-wide conversational AI for deep Q&A across your entire video library.

```typescript
// Streaming (default)
const stream = await bold.ai.chat({ prompt: 'How do I price my SaaS?' });

for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
  if (event.type === 'sources') console.log('Sources:', event.sources);
}

// Non-streaming
const response = await bold.ai.chat({ 
  prompt: 'What are the best closing techniques?',
  stream: false 
});
console.log(response.content);
```

**Options:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | The user's question (required) |
| `stream` | `boolean` | `true` (default) for SSE, `false` for JSON |
| `videoId` | `string` | If provided, scope to this video instead of whole library |
| `currentTime` | `number` | Current playback position (only with `videoId`) |
| `conversationId` | `string` | Pass to continue existing conversation |
| `collectionId` | `string` | Filter to a specific collection |
| `tags` | `string[]` | Filter by tags |

### Recommendations

Get AI-powered video recommendations based on topics — ideal for personalized learning paths, exam prep, and content discovery.

```typescript
// Streaming (default)
const stream = await bold.ai.recommendations({ 
  topics: ['contract law', 'ethics', 'client management'],
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
const response = await bold.ai.recommendations({ 
  topics: ['sales', 'marketing'],
  stream: false 
});
console.log(response.guidance);
console.log(response.recommendations);
```

**Options:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `topics` | `string[]` | Topics to find content for (required) |
| `stream` | `boolean` | `true` (default) for SSE, `false` for JSON |
| `limit` | `number` | Max videos per topic (default: 5, max: 20) |
| `collectionId` | `string` | Filter to a specific collection |
| `tags` | `string[]` | Filter by tags |
| `includeGuidance` | `boolean` | Include AI learning path narrative (default: true) |
| `context` | `AIContextMessage[]` | Previous conversation turns for follow-ups |

### Search

Fast semantic search with a brief AI-generated summary.

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

### Video-Scoped Chat

Chat about a specific video by passing `videoId`. Uses only that video's transcript as context.

```typescript
const stream = await bold.ai.chat({ 
  videoId: 'video-id',
  prompt: 'What is discussed at the 5 minute mark?' 
});

for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
}

// With playback context (coming soon)
const stream = await bold.ai.chat({ 
  videoId: 'video-id',
  prompt: 'What does she mean by that?',
  currentTime: 847  // seconds
});
```

### Get Conversation History

Retrieve a conversation by ID to display message history:

```typescript
const conversation = await bold.ai.getConversation('550e8400-e29b-41d4-a716-446655440000');

console.log(`Created: ${conversation.createdAt}`);
for (const msg of conversation.messages) {
  console.log(`${msg.role}: ${msg.content}`);
}
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
  Portal,
  PortalHero,
  MenuItem,
  AIEvent,
  AIResponse,
  ChatOptions,
  SearchOptions,
  RecommendationsOptions,
  RecommendationsResponse,
  Recommendation,
  Conversation,
  ConversationMessage,
  Source,
  Viewer,
  ViewerProgress,
  ViewerLookupParams,
  ListProgressOptions,
  ListVideosOptions,
  ListVideosLatestOptions,
  ListVideosIndexOptions,
  // Community API
  Post,
  PostAuthor,
  Comment,
  ReactionResponse,
  ListPostsOptions,
  CreatePostData,
  UpdatePostData,
  CreateCommentData
} from '@boldvideo/bold-js';
```

---

## Migration from v1.7.x

### Breaking: All response types now use camelCase

**All API responses** (videos, playlists, settings, AI) are now transformed to use idiomatic TypeScript/JavaScript naming:

```typescript
// Before (v1.7.x and earlier)
video.playback_id
video.published_at
video.stream_url
video.meta_data
settings.featured_playlists
settings.menu_items
settings.theme_config
playlist.is_private

// After (v1.8.0)
video.playbackId
video.publishedAt
video.streamUrl
video.metaData
settings.featuredPlaylists
settings.menuItems
settings.themeConfig
playlist.isPrivate
```

### Method Changes

| Old | New | Notes |
|-----|-----|-------|
| `bold.ai.ask(opts)` | `bold.ai.chat(opts)` | `ask()` still works but is deprecated |
| `bold.ai.coach(opts)` | `bold.ai.chat(opts)` | `coach()` still works but is deprecated |
| `bold.ai.chat(videoId, opts)` | `bold.ai.chat({ videoId, ...opts })` | Pass `videoId` in options |
| `bold.ai.recommend(opts)` | `bold.ai.recommendations(opts)` | `recommend()` still works but is deprecated |

### Type Renames

| Old Type | New Type |
|----------|----------|
| `AskOptions` | `ChatOptions` |
| `RecommendOptions` | `RecommendationsOptions` |
| `RecommendResponse` | `RecommendationsResponse` |

The old types are still exported as aliases for backward compatibility.

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
