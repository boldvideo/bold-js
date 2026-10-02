---
"@boldvideo/bold-js": minor
---

Add community comment editing with `community.comments.update(viewerId, commentId, { content, mentions? })`. Forward mention external IDs on post edits and expose nullable `editedAt` on posts and comments. Requires the Bold community editing API (BOLD-2007).

Correct the comment-create response type to `CommentThread`, matching the API's nested `reactions` and `author` fields. Reply `parentCommentId` is optional because the API can represent the parent through nesting. Code using the legacy create-response fields should use `reactions.count` and `author` instead.
