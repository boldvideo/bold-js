---
"@boldvideo/bold-js": minor
---

Redesign Community API types to eliminate N+1 queries

**Breaking changes to Post type:**
- `viewer` → `author` (creator of the post)
- `reactionsCount` → `reactions.count`
- `commentsCount` → `comments.count`
- `viewerReacted` → `reactions.viewer_has_reacted`
- `createdAt` → `created_at`

**New types:**
- `UserSummary` - minimal profile with `id`, `name`, `avatar_url`
- `ReactionSummary` - `{ count, reacted_by[], viewer_has_reacted? }`
- `CommentSummary` - `{ count, commented_by[], items? }`
- `CommentThread` and `Reply` - structured comment threading
- `PaginationMeta` and `PaginatedResponse<T>` - page-based pagination

**Pagination changes:**
- `posts.list()` now uses `page`/`pageSize` instead of `limit`/`offset`
- Returns `PaginatedResponse<Post>` with `data[]` and `meta`

**Benefits:**
- List endpoint now includes `reacted_by` and `commented_by` arrays (up to 10 users)
- Enables avatar display without fetching each post individually
- Consistent object shapes between list and detail views
