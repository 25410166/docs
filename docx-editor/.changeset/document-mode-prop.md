---
'@casualoffice/docs': minor
---

Add a `documentMode` prop (`'editing' | 'suggesting' | 'viewing'`) to DocxEditor and CasualEditor, using SuperDoc vocabulary so the docs and sheets SDKs match. It maps onto the existing mode mechanism and takes precedence over the legacy `mode`/`readOnly` props when both are supplied. Also adds runtime `setDocumentMode(mode)` / `getDocumentMode()` methods on the editor ref.
