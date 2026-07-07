---
'@casualoffice/docs': patch
---

Agent loop correctness: a sub-task that calls no tool is now marked failed (not a false success); the executor uses native tool-calling instead of an XML convention it never parsed; the destructive create_document tool is excluded from sub-task executors; and reflection only accepts structured corrective tasks (no prose-to-task garbage) with dedup against existing steps.
