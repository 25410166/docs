---
'@casualoffice/docs': patch
---

Show an "asking AI" presence chip: useCollab now exposes `aiEditingBy` (the peer who triggered the running AI request) alongside `aiIsEditing`, and PresenceCluster renders a small chip naming the requester or a generic "AI is editing…" when the name is unknown or it's the local user.
