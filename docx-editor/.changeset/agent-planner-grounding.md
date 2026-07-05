---
'@eigenpal/docx-js-editor': patch
---

The agent planner can now be grounded with a document snapshot (AgentOptions.planningContext) so it decomposes a goal against real structure — the docs panel supplies the heading outline, preventing e.g. a "summarize" goal from being planned as edit sub-tasks.
