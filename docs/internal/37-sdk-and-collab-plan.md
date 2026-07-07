# 37 — SDK + Collab initiative

_From the 2026-07-07 four-stream analysis (collab UX, AI-via-collab, current SDK surface, peer-SDK patterns). Tracked in **GitHub Project "Casual Editor — SDK & Collab"**: https://github.com/orgs/CasualOffice/projects/2 — issues filed in docs/sheets/collab, per-repo progress visible via the board's Repository field._

## Goal

Ship both editors as an **installable, client-side npm SDK** that feels **native** in a host app: `read` vs `editor` modes, single-user by default, real-time when a collab URL + room (fileId) is passed, and full programmatic control — events, hooks, inject/replace handlers, hide/disable features. Docs **and** sheets, one contract.

## What already exists (don't rebuild)

- **Docs:** `DocxEditor` + `CasualEditor` + `CasualEditorIframe` + `renderAsync`; `embed/protocol.ts` postMessage contract; rich `DocxEditorRef`; `--doc-*` token theming.
- **Sheets:** `@casualoffice/sheets` SDK pkg — `CasualSheets`/`CasualSheetsIframe`/`CasualSheetsAPI`, `attachCollab()`, `features` flag map + `ChromeExtensions` slots.
- **Collab:** Node Hocuspocus+Yjs server; presence/cursors/comments **exist** (docs `PresenceCluster` built but unmounted; sheets richer); share-token infra exists (workbook-oriented).
- The shared `casual.*` envelope (`app:'docs'|'sheet'`) makes SDK convergence realistic.

## Peer north-star (SuperDoc / Tiptap / Univer / Liveblocks / Lexical)

8 must-adopt patterns: (1) one declarative config + **dual mount** (React component AND imperative ctor); (2) an **imperative handle** with a stable method surface; (3) **3-value `documentMode`** (edit/view/suggest) not a boolean; (4) **dual events** (config map AND `.on()/off()`) with a catalog; (5) **feature-flag/slot** system to hide UI by id; (6) **extension API** that adds AND replaces behavior; (7) **collab-by-config**, provider-agnostic; (8) **style isolation** + token vars + `cspNonce`. Anti-patterns: no React component, no collab-by-config.

## Phases (see project #2 for the tracked issues)

- **Phase 1 — Collab UX:** docs share/permission UI (docs#261); mount PresenceCluster (docs#262); default reconnect UI (docs#263); **P0 security**: anonymous `?role=comment` grants write (collab#9).
- **Phase 2 — AI via Collab:** **P0** agent mode dead for all web users — decouple from `drivesLoop` (docs#264); attribute AI edits to the user not "DocOps AI" (docs#265); render AI-editing presence w/ identity (docs#266).
- **Phase 3 — SDK Core:** unify one component contract (docs#267/sheets#277); `documentMode` (docs#268/sheets#278); declarative collab prop on sheets (sheets#279); promote AI to an `ai={}` SDK prop (docs#269/sheets#280 — sheets has no SDK AI today).
- **Phase 4 — Events & Hooks:** dual events surface + catalog (docs#270/sheets#281); `onDirtyChange` + normalized imperative handle `executeCommand`/undo/redo/focus (docs#271).
- **Phase 5 — Native Feel:** feature-flag map + toolbar slots for docs (docs#272); extension API add+replace (docs#273); real style isolation (docs#274).

## Sequencing

Do **Phase 1–2 first** (collab UX + AI-via-collab fixes — several are P0/security and unblock the SDK's collab + AI story), then the SDK Phases 3→5. Each phase's issues are tagged in the board with Phase + Priority; mark progress there per repo.
