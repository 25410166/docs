---
'@eigenpal/docx-js-editor': minor
---

Add an `ai` prop to enable the built-in DocOps assistant. `ai={{ enabled: true }}` unlocks the assistant panel without the `window.__casualFeatures__.docops` global (kept as a deprecated fallback for one minor). `ai.transport` routes model calls and `ai.onAction` fires after each document write the assistant performs. Also forwarded from `CasualEditor`.
