---
'@casualoffice/docs': patch
---

Fix `chrome:"embedded"` hiding the editing menus. The embedded resolver welded the menu-bar default to the app-shell default, so embedded stripped the whole menu bar — stranding the ~50 features that live only there (Insert image/table, Format paragraph, Tools word-count, …). Embedded now keeps the formatting toolbar AND the editing menus, dropping only the app shell: the logo/document-name row and the host-owned File/Help entries (Open/New/Version-history/About). Hosts can still force either region with `features={{ menuBar, titleBar }}`.
