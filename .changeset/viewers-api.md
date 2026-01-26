---
"@boldvideo/bold-js": minor
---

Add Viewers API for managing external users and tracking video progress

New methods on the `viewers` namespace:
- `viewers.list()` - List all viewers
- `viewers.get(id)` - Get a viewer by ID
- `viewers.lookup({ externalId } | { email })` - Find viewer by external ID or email
- `viewers.create(data)` - Create a new viewer
- `viewers.update(id, data)` - Update a viewer
- `viewers.listProgress(viewerId, options?)` - List progress for a viewer
- `viewers.getProgress(viewerId, videoId)` - Get progress for a video
- `viewers.saveProgress(viewerId, videoId, data)` - Save/update progress

Also fixes `camelizeKeys` to preserve user-defined trait keys (e.g., `company_name` stays as-is instead of becoming `companyName`).
