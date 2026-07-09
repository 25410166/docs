---
'@casualoffice/docs': minor
---

Add `chrome="embedded"` — a formatting-toolbar-only surface for hosts that render their own app shell. It keeps the editing UI (formatting toolbar, panel rail, zoom, ruler) but hides the app shell: logo, document-name row, menu bar, and the About / Help / File menus that live inside them. Cmd/Ctrl+O and Cmd/Ctrl+N are suppressed (the host owns open/new); Cmd/Ctrl+S still routes to `onSave` when provided. The shell rows can also be toggled independently of the toolbar via the new `features.titleBar` / `features.menuBar` ids.
