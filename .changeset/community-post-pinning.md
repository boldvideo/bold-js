---
"@boldvideo/bold-js": minor
---

Add `community.posts.setPinned(postId, pinned)` for pinning and unpinning community posts. It requires the new server-only `adminApiKey` client option, which is sent as `X-Bold-Admin-Api-Key` on admin operations only. Pinning is idempotent: re-pinning a post keeps its original `pinnedAt`.
