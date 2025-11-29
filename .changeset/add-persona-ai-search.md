---
"@boldvideo/bold-js": patch
---

Add persona and ai_search types to Account settings

- Added `Persona` type (discriminated union based on `enabled` flag)
- Added `AccountAISearch` type with `enabled` boolean
- Updated `Account` type to include `ai_search` and `persona` fields
