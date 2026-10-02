---
"@boldvideo/bold-js": major
---

Add community comment editing with `community.comments.update(viewerId, commentId, { content, mentions? })`. Forward mention external IDs on post edits and expose nullable `editedAt` on posts and comments. Requires the Bold community editing API (BOLD-2007).

Correct the comment-create response type to `CommentThread`, matching the API's nested `reactions` and `author` fields. Reply `parentCommentId` is optional because the API can represent the parent through nesting. Code using the legacy create-response fields should use `reactions.count` and `author` instead.

Breaking TypeScript migration: handle nullable comment authors and optional reply parent IDs. Comment threads and replies now require `depth` and `updatedAt`, and replies include recursive `replies`; update typed fixtures accordingly. These fields match the backend response.

Comment update responses contain `replies: []`, even for a parent with existing replies. Preserve the cached subtree or refetch the post after editing rather than replacing the whole thread with the update response.
