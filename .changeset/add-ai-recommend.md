---
"@boldvideo/bold-js": minor
---

Add `bold.ai.recommend()` for AI-powered video recommendations

- New method `bold.ai.recommend({ topics, ...options })` returns personalized video recommendations based on topics
- Supports both streaming (default) and non-streaming modes
- Includes AI-generated guidance for learning paths
- New types: `RecommendOptions`, `RecommendResponse`, `Recommendation`, `RecommendationVideo`, `TopicInput`
- New `recommendations` event type in `AIEvent` union for streaming responses
