---
"@boldvideo/bold-js": minor
---

Forward `clientIp` on `auth.sessions.create`. The new optional `clientIp` field on `AuthSessionCreateData` is sent as `client_ip` in the POST body so server-authoritative integrators can attribute a session to the end-user IP for coarse geo resolution. When omitted, the field is not sent and the backend falls back to the proxy-aware transport IP.
