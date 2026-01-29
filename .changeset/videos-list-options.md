---
"@boldvideo/bold-js": minor
---

Add full options support to `videos.list()` for tag, collectionId, viewerId, and page filtering

**New features:**
- Filter videos by `tag` and `collectionId` on both endpoints
- Include watch progress with `viewerId` parameter
- Access paginated `/videos` endpoint using `page` parameter

**Usage:**

```typescript
// Latest videos with filters
await bold.videos.list({ limit: 20, tag: 'sales', collectionId: 'col_123' });

// Include viewer watch progress
await bold.videos.list({ limit: 20, viewerId: 'viewer_123' });

// Paginated index (uses /videos endpoint)
await bold.videos.list({ page: 2, tag: 'sales' });
```

**Breaking:** None. Existing `bold.videos.list()` and `bold.videos.list(12)` calls work unchanged.
