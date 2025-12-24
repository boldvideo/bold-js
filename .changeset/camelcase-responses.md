---
"@boldvideo/bold-js": minor
---

Transform all API responses to use camelCase (TypeScript/JavaScript convention)

**Breaking Changes:**

All response types now use camelCase consistently across the entire SDK:

- **Videos**: `playback_id` → `playbackId`, `published_at` → `publishedAt`, `stream_url` → `streamUrl`, `meta_data` → `metaData`, `captions_label` → `captionsLabel`, `download_urls` → `downloadUrls`, etc.
- **Playlists**: `is_private` → `isPrivate`
- **Settings**: `featured_playlists` → `featuredPlaylists`, `menu_items` → `menuItems`, `theme_config` → `themeConfig`, `ai_avatar` → `aiAvatar`, `logo_url` → `logoUrl`, etc.
- **Portal/Theme**: `show_chapters` → `showChapters`, `font_body` → `fontBody`, `color_scheme` → `colorScheme`, `css_overrides` → `cssOverrides`, etc.
- **AI responses**: (already camelCase in v1.8.0)

**Internal:**

- Applied `camelizeKeys()` transformation in `fetchers.ts` at the transport boundary
- Updated all type definitions in `types.ts` to use camelCase
