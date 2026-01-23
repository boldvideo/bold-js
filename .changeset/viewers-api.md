---
"@boldvideo/bold-js": minor
---

Add Viewers API for managing external users and tracking video progress

New methods on the `viewers` namespace:
- `viewers.list()` - List all viewers
- `viewers.get(id)` - Get a viewer by ID
- `viewers.create(data)` - Create a new viewer
- `viewers.update(id, data)` - Update a viewer
- `viewers.listProgress(viewerId, options?)` - List progress for a viewer
- `viewers.getProgress(viewerId, videoId)` - Get progress for a video
- `viewers.saveProgress(viewerId, videoId, data)` - Save/update progress
