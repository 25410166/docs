---
'@eigenpal/docx-js-editor': patch
---

The agent's per-task loop now stops when the model repeats the identical tool call two rounds in a row, instead of burning the whole round budget re-calling the same tool with no progress — a common small-local-model failure.
