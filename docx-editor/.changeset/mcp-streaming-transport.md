---
'@eigenpal/docx-js-editor': patch
---

MCP Streamable-HTTP transport now reads `text/event-stream` responses incrementally instead of buffering the whole body, so it no longer hangs against spec-compliant streaming MCP servers. Also captures the `Mcp-Session-Id` for stateful servers, sends the protocol-version header, follows `tools/list` pagination, and aborts in-flight requests on close.
