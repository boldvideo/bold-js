---
"@boldvideo/player": patch
---

Correct the analytics example in the README. It created the SDK client in the browser with the account's API key; it now sends events through a route on your own site, so the key stays on the server. No code changes.
