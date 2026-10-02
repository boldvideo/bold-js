---
"@boldvideo/bold-js": minor
---

Add opt-in reply-preserving comment deletion with `{ preserveReplies: true }`, and nullable `deletedAt` metadata for comment placeholders. Deleted comments have empty content and a null author; comment and reply author types now include null, so check deletion before accessing author fields. Existing delete calls retain cascading behavior. Requires the Bold reply-preservation API (BOLD-2008).
