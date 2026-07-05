---
'@eigenpal/docx-js-editor': patch
---

Output from external MCP servers is now labeled as untrusted before it reaches the model, so a malicious server can't inject instructions that the agent would act on with real document tools. Built-in tool output is unaffected.
