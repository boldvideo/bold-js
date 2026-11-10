# Recorded controller contracts with synthetic data

These files contain actual controller output from deterministic integration tests, not hand-authored SSE events. The four scenarios are covered focus, widened library answer, pointers, and locked matches. Titles, transcripts, prompts, model responses, IDs and timestamps are disposable synthetic test data; there is no customer data.

- `.sse` files preserve the captured wire bytes unchanged.
- `.json` files come from separate non-streaming requests, so their conversation/message/interaction IDs differ from SSE.
- History files belong to the SSE conversations. `history.json` is the covered scenario. History can enrich focused sources with current portal URLs without changing citation identity or timestamp.

The generating integration tests exercise controller routing, persistence, URL enrichment and history serialization with deterministic model responses, stubbed search and a local transcript server. These are not real-model evaluations, search-relevance measurements, deployed HTTP captures or production checks.

SDK replay tests serve the original SSE bytes and JSON/history bodies through a local HTTP server. They check all four scenarios, event ordering, terminal behavior, response/history identity, source metadata, citation indices, pointer/locked-match restrictions, and the actual usage shapes. Covered usage has input/output token fields; widened usage has prompt/completion token fields and cost; pointers/locked responses have null usage. No usage totals are fabricated or normalized.

The separately maintained `ai-focus.mjs` fixtures remain explicitly synthetic and cover parser edge cases not present in these recordings. Nullable pointer URLs are also tested as a synthetic declaration variant, not represented as an additional recording.
