---
"@boldvideo/bold-js": minor
---

Expose `travelVerdict` on viewer-session items. The session-management viewer-sessions methods (e.g. `listViewerSessionsByExternalId`) now return `travelVerdict: "impossible_travel" | null` on each session, surfacing Bold's authoritative impossible-travel signal. The new `TravelVerdict` type is exported. It is a label only — no coordinates, IP, distance, or speed — and defaults to `null` when a session is unflagged or the backend predates the field.
