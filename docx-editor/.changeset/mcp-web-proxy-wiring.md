---
'@eigenpal/docx-js-editor': patch
---

The DocOps panel now routes external MCP connections through the same-origin /api/mcp-proxy when running on the web (browsers can't reach most MCP servers directly — no CORS); desktop connects directly. Completes the web-MCP path end to end.
