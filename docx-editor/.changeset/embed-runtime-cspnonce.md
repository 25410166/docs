---
'@casualoffice/docs': patch
---

The iframe embed runtime now reads the `cspNonce` URL param at startup and stamps it onto the stylesheets the editor injects while mounting, so strict-CSP hosts (`style-src 'nonce-<value>'`) don't drop the editor's parse-time styles.
