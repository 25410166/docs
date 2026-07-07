---
'@casualoffice/docs': minor
---

Add `features` and `editorExtensions` props to `DocxEditor` (and `CasualEditor`). `features` is a per-control on/off map (`Record<string, boolean>`) that hides toolbar controls by id — the coarse `show*` booleans (`showToolbar`, `showStatusBar`, `showPanelRail`, `showZoomControl`, `showPrintButton`, `showOutline`, `showRuler`) now work as deprecated shortcuts, with `features` winning when both are set. `editorExtensions` is a SuperDoc-style API for adding or replacing ProseMirror behavior without forking, layered on top of the existing `externalPlugins`. Exports the `DOCX_FEATURE_IDS` catalog, `FeatureMap`, `isFeatureEnabled`, `EditorExtension`, and `resolveEditorExtensionPlugins`.
