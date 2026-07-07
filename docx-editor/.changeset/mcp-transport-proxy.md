---
'@casualoffice/docs': patch
---

HttpMcpTransport gains a proxyUrl option: when set, MCP JSON-RPC is POSTed to a same-origin CORS proxy (e.g. the collab server's /api/mcp-proxy) as { url, headers, body } and forwarded server-side, so the web editor can reach external MCP servers that don't send CORS headers. Direct connections are unchanged.
