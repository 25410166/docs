---
'@casualoffice/docs': minor
---

CasualEditor now shows a default reconnecting/offline banner above the editor while a collab session is degraded. Driven by the live collab status, it renders an amber "Reconnecting…" strip when connecting and a red "You're offline — edits saved locally" strip when disconnected, and nothing once connected. Theme-token styled via `--doc-*` vars. Also exported as the standalone `ReconnectBanner` component for hosts that compose their own layout.
