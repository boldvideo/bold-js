---
"@boldvideo/bold-js": patch
---

Align SDK with API specification

- Renamed `synthesize` to `includeGuidance` in `RecommendOptions` to match API
- Renamed `why` to `reason` in `RecommendationVideo` type to match API response
- Added `tags` filter to `AskOptions` and `SearchOptions`
- Added `currentTime` to `ChatOptions` for playback context
