---
"@boldvideo/bold-js": minor
---

Add Community API for posts, comments, and reactions

New `bold.community` namespace with full CRUD operations:

**Posts:**
- `bold.community.posts.list(opts?)` - List posts with category/limit/offset filters
- `bold.community.posts.get(id, viewerId?)` - Get single post with comments
- `bold.community.posts.create(viewerId, data)` - Create a post (markdown supported)
- `bold.community.posts.update(viewerId, id, data)` - Update post (owner/admin only)
- `bold.community.posts.delete(viewerId, id)` - Delete post (owner/admin only)
- `bold.community.posts.react(viewerId, id)` - Toggle reaction (like/unlike)

**Comments:**
- `bold.community.comments.create(viewerId, postId, data)` - Create comment with optional `parentId` for nested replies
- `bold.community.comments.delete(viewerId, id)` - Delete comment (owner/admin only)
- `bold.community.comments.react(viewerId, id)` - Toggle reaction

**New Types:**
- `Post`, `PostAuthor`, `Comment`, `ReactionResponse`
- `ListPostsOptions`, `CreatePostData`, `UpdatePostData`, `CreateCommentData`
- `CommunityAPIError` - Error class for Community API operations
