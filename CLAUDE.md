# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Bold JavaScript SDK (`@boldvideo/bold-js`) - a TypeScript client library for interacting with the Bold Video API. The SDK provides methods for fetching videos, playlists, channel settings, and tracking analytics events.

## Common Development Commands

```bash
# Install dependencies
pnpm install

# Build the project (outputs to dist/)
pnpm run build

# Run type checking/linting
pnpm run lint

# Publish new version (uses changesets)
pnpm changeset
pnpm changeset version
pnpm changeset publish
```

## Architecture & Key Components

### Client Structure
The SDK uses a factory pattern where `createClient(apiKey)` returns an object with namespaced methods:
- `bold.settings()` - Fetch channel settings
- `bold.videos.list()` / `.get(id)` / `.search(query)` - Video operations
- `bold.playlists.list()` / `.get(id)` - Playlist operations
- `bold.trackEvent()` / `bold.trackPageView()` - Analytics tracking

### Core Files
- `/src/index.ts` - Main entry point, exports `createClient` and all types
- `/src/lib/client.ts` - Client factory that creates the Bold instance with API key auth
- `/src/lib/fetchers.ts` - Individual API endpoint implementations
- `/src/lib/tracking.ts` - Analytics event tracking with throttling
- `/src/lib/types.ts` - TypeScript interfaces for Video, Playlist, Settings, etc.
- `/src/util/throttle.ts` - Throttling utility for rate-limiting event tracking

### Build Configuration
- Uses `tsup` for building TypeScript to both ESM and CommonJS formats
- Outputs to `/dist/` with type declarations
- TypeScript strict mode enabled
- Target: ES2016

## Development Workflow

1. The project uses GitHub Actions for CI/CD:
   - All branches run lint and build checks
   - Main branch can publish to npm using changesets

2. When making changes:
   - Ensure TypeScript types are properly defined
   - Run `pnpm run lint` before committing
   - The SDK supports both ESM and CommonJS consumers

3. API Integration:
   - Default base URL: `https://app.boldvideo.io/api/v1/`
   - Authentication via API key in Authorization header
   - All API methods return promises

4. Analytics Tracking:
   - Events are throttled to prevent API rate limiting
   - User IDs are auto-generated for each client instance
   - Debug mode available for development

## Important Notes

- No test framework is currently configured
- The SDK is designed to be lightweight with minimal dependencies (only axios)
- All API responses follow the type definitions in `/src/lib/types.ts`
- The tracking system includes automatic throttling to handle high-frequency events like video progress updates