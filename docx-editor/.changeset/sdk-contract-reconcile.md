---
'@casualoffice/docs': minor
---

Reconcile the SDK surface with the unified contract (doc 38). `CasualEditor` gains a declarative `collab` object — `collab={{ server, room, user }}` — matching the shape Casual Sheets ships; it drives the collab session (`server` is the WS URL, `room` the room id, `user` the presence identity) and wins over the now-`@deprecated` `backendUrl`/`user` pair when both are given. `collab.password`/`token`/`role` are accepted for cross-SDK parity but reserved (not yet wired). The `renderAsync` imperative handle now also exposes the unified surface — `on`/`off`, `executeCommand`, `getContent`/`setContent`, `undo`/`redo`, and `setDocumentMode` — delegating to the underlying editor so the vanilla mount matches the React ref. All additive; existing methods and props are unchanged.
