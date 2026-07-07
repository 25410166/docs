---
'@casualoffice/docs': minor
---

Add a built-in ShareDialog to CasualEditor's collab presence cluster: the title-bar Share button now opens a dialog with a room link, a view/comment/edit role selector, and a copy button. Shown only when collab is active; a host-supplied `onShare` still overrides it. Exported `ShareDialog` and `buildShareUrl` for hosts that want to render it themselves.
