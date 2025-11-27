---
"@boldvideo/bold-js": minor
---

refactor: Align Citation type with backend Video schema

**BREAKING CHANGE**: The `Citation` interface has been restructured to match the backend API changes.

**Before:**
```typescript
interface Citation {
  video_id: string;
  title: string;
  timestamp_ms: number;
  text: string;
}
```

**After:**
```typescript
interface Citation {
  video: Pick<Video, 'internal_id' | 'title' | 'playback_id'>;
  start_ms: number;
  end_ms: number;
  text: string;
}
```

Migration:
- `citation.video_id` → `citation.video.internal_id`
- `citation.title` → `citation.video.title`
- `citation.timestamp_ms` → `citation.start_ms`
- New: `citation.video.playback_id` and `citation.end_ms`
