---
'@casualoffice/docs': minor
---

Add the unified SDK contract surface to the DocxEditor imperative handle (doc 38). New canonical methods: `getContent()` / `setContent()` / `getSelection()` (aliasing the existing `getDocument` / `loadDocument` / `getSelectionInfo`), `import()` / `export()`, `executeCommand(id, params?)` routed through the editor command registry, `undo()` / `redo()`, and a unified `on(event, handler)` / `off(event, handler)` emitter covering `ready`, `change`, `selectionChange`, `save`, `error`, `dirtyChange`, `documentModeChange`, `collaborationReady`, and `collaborationStatus`. Adds `onDirtyChange` and `onDocumentModeChange` config-callback props (the latter renaming `onModeChange`). Every prior name stays as a deprecated alias, so existing code keeps working. CasualEditor forwards the new props.
