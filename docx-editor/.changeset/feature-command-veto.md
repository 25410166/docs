---
'@casualoffice/docs': patch
---

Disabling a feature now vetoes its command, not just its toolbar button. When `features={{ bold: false }}` (and likewise italic/underline/strikethrough), the keyboard shortcut (e.g. Ctrl+B) is a no-op and `DocxEditorRef.executeCommand('bold' | 'toggleBold')` returns `false` without mutating the document — matching the hidden button.
