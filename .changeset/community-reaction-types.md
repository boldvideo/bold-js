---
"@boldvideo/bold-js": minor
---

Community reactions now have a type: `like`, `love`, `thanks`, `insightful`, `celebrate` or `funny`. Pass it as `react(viewerId, id, { type })` on posts and comments; a call without a type still toggles a like. Reaction summaries add `counts` and `viewerReaction`, `reactedBy` entries add `reaction`, and the react response adds `reaction` and `counts`.
