---
'@casualoffice/docs': minor
---

CollabTransport is now single-round (drivesLoop=false): the collab server is a key-holding LLM proxy for one turn and the panel/agent drives the tool loop — so the plan→execute→reflect agent (and the flat chat loop) run on the web, not only on desktop. Previously the server drove the whole loop, which hid the Agent toggle on every web session.
