---
"@boldvideo/bold-js": minor
---

Fix community API types to match the camelCase runtime (BOLD-1577) and add nested comment reactions (BOLD-1580)

The SDK camelizes every API response at the transport boundary, but since 1.19.0 the community types declared snake_case fields as canonical, so those fields were `undefined` at runtime (e.g. `post.created_at`). All community read types now declare camelCase fields, matching what the SDK actually returns:

- `Post.created_at` → `createdAt` (the always-undefined snake_case field is removed)
- `UserSummary.avatar_url` → `avatarUrl`
- `ReactionSummary.reacted_by` / `viewer_has_reacted` → `reactedBy` / `viewerHasReacted`
- `CommentSummary.commented_by` → `commentedBy`
- `Reply.created_at` / `parent_comment_id` → `createdAt` / `parentCommentId`
- `CommentThread.created_at` → `createdAt`

Comments and replies now expose nested reaction state via a new `CommentReactionSummary` type (`{ count, viewerHasReacted? }`): `CommentThread.reactions` and `Reply.reactions`.
