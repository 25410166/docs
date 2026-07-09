---
'@casualoffice/docs': patch
---

Fix click-time canvas flicker and Linux out-of-memory caused by font loading. Each font `loadingdone` event previously triggered a synchronous, cache-clearing full relayout; a document pulling in many `@font-face` subsets plus the icon font produced a burst of full re-measures (visible as flicker on click, and an OOM on Linux). Font-load relayouts are now coalesced through the existing rAF scheduler with a trailing debounce and gated to the families the document actually uses. Also size the text caret to the run's font metrics (~1.2× font-size, centered) instead of the full line-box height, so the caret is no longer 1.5–2× too tall at increased line spacing.
