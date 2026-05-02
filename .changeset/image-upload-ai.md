---
"@boldvideo/bold-js": minor
---

Add image-upload support to `bold.ai` (chat / ask / coach / search)

- New `images?: ImageInput[]` parameter on `ChatOptions` and `SearchOptions` — accepts `File`, `Blob`, or pre-encoded `{ type: 'base64', mediaType, data }` items. `ask` and `coach` inherit support via delegation to `chat`.
- New helpers: `bold.ai.imageFromFile(file)`, `bold.ai.imageFromCanvas(canvas, options?)`, `bold.ai.validateImage(file, limits)`.
- New `MultimodalCapability` type, exposed on `Account.multimodal?` from `GET /api/v1/settings`.
- New `image_analysis` SSE event on the typed `AIEvent` union (`{ status: "analyzing" }` and `{ status: "complete", description }`).
- New typed `AIAPIError` thrown on non-2xx responses from all AI HTTP paths (replaces generic `Error`).

Wire format for images is snake_case (`{ type: 'base64', media_type, data }`); the SDK handles the rename transparently.
