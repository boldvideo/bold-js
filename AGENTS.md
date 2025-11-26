# AGENTS.md

This file provides guidance to AI coding agents working with this repository.

## Project Overview

This is the Bold JavaScript SDK (`@boldvideo/bold-js`) - a TypeScript client library for interacting with the Bold Video API. The SDK provides methods for fetching videos, playlists, channel settings, and tracking analytics events.

## Tech Stack

- Language: TypeScript 4.9+ (strict mode enabled)
- Build Tool: tsup (outputs both ESM and CommonJS)
- Package Manager: pnpm
- Target: ES2020
- Runtime: Node.js 20+
- Dependencies: axios (only runtime dependency)

## Commands

```bash
pnpm install          # Install dependencies
pnpm run build        # Build to dist/ (ESM + CJS + type declarations)
pnpm run lint         # Type checking with tsc
pnpm changeset        # Create a changeset for versioning
pnpm changeset version   # Apply changesets and bump versions
pnpm changeset publish   # Publish to npm
```

## Project Structure

```
/src
  index.ts              # Main entry point - exports createClient and all types
  /lib
    client.ts           # Client factory (createClient function)
    fetchers.ts         # API endpoint implementations (videos, playlists, settings)
    ai.ts               # AI streaming endpoints (coach, ask) using native fetch + SSE
    types.ts            # TypeScript interfaces (Video, Playlist, Settings, etc.)
    tracking.ts         # Analytics event tracking with throttling
    constants.ts        # Shared constants (API base URLs)
  /util
    throttle.ts         # Rate limiting utility for high-frequency events
/dist                   # Build output (generated)
```

## Architecture

The SDK uses a **factory pattern** where `createClient(apiKey)` returns an object with namespaced methods:

```typescript
const bold = createClient('API_KEY');

// Available methods:
bold.settings()           // Fetch channel settings
bold.videos.list()        // List latest videos
bold.videos.get(id)       // Get single video
bold.videos.search(query) // Search videos
bold.playlists.list()     // List playlists
bold.playlists.get(id)    // Get single playlist
bold.ai.coach(opts)       // AI RAG assistant (streaming)
bold.ai.ask(videoId, opts)// Video Q&A (streaming)
bold.trackEvent()         // Track video events
bold.trackPageView()      // Track page views
```

## Code Style

- Use functional patterns (factory functions, not classes)
- Export all public types from `src/index.ts`
- All API methods return Promises
- Use TypeScript strict mode
- camelCase for functions and variables
- PascalCase for types and interfaces
- Wrap API calls with try/catch and log errors

## API Integration

- Base URL: `https://app.boldvideo.io/api/v1/`
- Authentication: API key in Authorization header
- All responses wrapped in `{ data: T }` structure

## Testing

- Run `pnpm run lint` before committing
- Ensure TypeScript compilation succeeds with no errors
- No test framework currently configured - manual testing required

## Boundaries

**Always:**
- Ensure TypeScript types are properly defined in `types.ts`
- Support both ESM and CommonJS consumers
- Follow existing patterns in the codebase
- Run `pnpm run lint` before committing
- Keep the SDK lightweight (minimal dependencies)

**Ask first:**
- Adding new dependencies
- Changing the public API surface
- Major architectural changes

**Never:**
- Commit API keys or secrets
- Remove or change existing public type exports without versioning
- Add test files without setting up a test framework first
