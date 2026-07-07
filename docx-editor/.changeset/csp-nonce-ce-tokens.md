---
'@casualoffice/docs': minor
---

Add a `cspNonce` prop to `CasualEditorIframe` for strict-CSP hosts. When set, the nonce is threaded through the iframe URL and stamped as the `nonce` attribute on every `<style>` / `<link rel="stylesheet">` in the same-origin iframe document (present at load and injected later), so hosts serving `style-src 'nonce-…'` don't have the editor's styles blocked. Also documents the iframe variant as the guaranteed style-isolation path and adds a stable public `--ce-*` CSS custom-property surface aliased over the internal `--doc-*` tokens.
