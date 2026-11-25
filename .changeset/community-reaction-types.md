---
"@boldvideo/bold-js": minor
---

Community reactions now have a type.

- `posts.react(viewerId, id, { type })` and `comments.react(viewerId, id, { type })` leave a named reaction, for example `love` or `thanks`. The name is yours to choose: Bold keeps no list, so your app decides which reactions it offers and how to draw them. A name is a lowercase letter followed by up to 31 lowercase letters, digits or underscores.
- A viewer holds one reaction per post or comment. Sending the type they already hold removes it; sending another one changes it.
- Nothing changes for existing code: `react(viewerId, id)` without a type still toggles a like and sends the same request as before.
- Reaction summaries add `counts` (per type) and `viewerReaction`, `reactedBy` entries add `reaction`, and the react response adds `reaction` and `counts`.
- New exported types: `ReactionType`, `ReactionCounts`, `ReactOptions`.
