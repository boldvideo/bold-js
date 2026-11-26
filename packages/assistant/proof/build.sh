#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
pnpm --filter @boldvideo/assistant run build
rm -rf dist
bun build harness.tsx --outdir dist --target browser --splitting --minify --production
ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=0x294b42:s=640x360:r=10 -t 120 -c:v libx264 -pix_fmt yuv420p -movflags +faststart dist/clip.mp4
