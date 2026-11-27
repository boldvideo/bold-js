---
"@boldvideo/bold-js": minor
---

Add an optional viewer UUID or external ID to `conversationStarters.list` to retrieve personalized answered-question starters. Export `AnsweredConversationStarter` and `isAnsweredStarter`, and document rendering card text and starting focused chat.

Requests without `viewer` and the `collection_ids` encoding are unchanged. `ConversationStarter` is now a union: TypeScript consumers must narrow with `isAnsweredStarter` before accessing variant-specific fields such as `source` or `collectionId`.
