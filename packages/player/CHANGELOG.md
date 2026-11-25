# @boldvideo/player

## 0.1.0

First release.

- `BoldPlayer`: a React player for Bold videos on Video.js 10, taking a video from bold-js as is.
- Poster, chapters, captions, timeline previews, signed playback and the library's default playback speed come from the video.
- Playback analytics go to Bold when the player is given a bold-js client.
- Accent colour, chapters and branding follow the account's Bold settings; `branding` shows the account's logo or Bold's wordmark.
- When the HLS stream cannot be loaded, playback continues from the video's static MP4 at the same position.
