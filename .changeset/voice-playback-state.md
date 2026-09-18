---
"@boldvideo/bold-js": minor
---

Add `VoiceSession.setPlaybackState()` to mute microphone and assistant audio during video playback, preserve the viewer's microphone mute choice, and share the current video position with the voice assistant. Video playback counts as activity without extending the server-granted maximum session duration.

Type the optional `Settings.account.voice.enabled` capability so frontends can show voice controls only when explicitly enabled, while remaining compatible with older settings responses.
