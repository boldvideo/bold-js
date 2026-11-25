#!/bin/sh
# The whole matrix, one engine at a time (they share the proxy).
cd "$(dirname "$0")"
node run.mjs chrome
node run.mjs webkit
node run.mjs webkit-native
SOURCE=playback-id node run.mjs chrome control master-503 master-404 rendition-503 mid-playback master-403 both-down
node summarize.mjs
