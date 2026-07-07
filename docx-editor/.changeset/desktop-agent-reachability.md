---
'@casualoffice/docs': patch
---

The plan→execute→reflect agent now runs on the desktop local model. DesktopTransport was drivesLoop=true, which hid the Agent toggle (gated on !drivesLoop) so the agent only ever ran on the cloud key path. It now does a single model turn per call() — like DirectTransport — and the panel/agent drives the tool loop, matching the panel's existing "Direct / Desktop" flat-loop branch.
