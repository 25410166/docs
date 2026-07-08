---
'@casualoffice/docs': minor
---

CasualEditor now threads `collab.token` through to the Hocuspocus handshake (previously reserved/unwired). Hosts with a JWT-protected collab server — e.g. Drive minting a per-file room token — can pass `collab={{ server, room, user, token }}` and the token reaches the provider's onAuthenticate hook.
