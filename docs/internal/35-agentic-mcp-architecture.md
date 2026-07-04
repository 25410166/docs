# 35 — Agentic AI + real MCP for DocOps

Status: **in progress** (2026-07-05). Owner-directed: the DocOps AI must be genuinely **agentic** (autonomous plan → execute → reflect), not just an MCP-shaped tool surface, and expose/consume tools over the **real Model Context Protocol**. Builds on the tool catalog in `@casualoffice/docops` and the panel loop in `DocOpsPanel.tsx`. Sibling of the production-rework plan in [34](34-ai-production-rework.md).

## Starting point (what existed)

- **Tools:** `@casualoffice/docops` defines a 17-tool catalog (6 read / 11 write), called in-process via `bridge.callTool`. MCP-*shaped* (Anthropic tool defs) but **not the protocol** — nothing pluggable, no external agent access. (The real MCP server lived in the purged AGPL `packages/agents`.)
- **Agentic:** a flat ReAct loop in `DocOpsPanel` (≤12 rounds). No planning, decomposition, reflection, or visible plan.

## Architecture (built)

All in `@casualoffice/docops` — pure logic, transport- and UI-agnostic, unit-tested.

### 1. ToolRegistry — the pluggability seam (`agent/registry.ts`)
Unifies tools from any number of `ToolSource`s into one catalog and routes each call to the owning source. The built-in bridge is one source; an MCP client is another. First-registered-wins on name collisions (built-in shadows external), reported via `collisions`. The agent never knows a tool's origin.

### 2. Agent orchestrator — plan → execute → reflect (`agent/agent.ts`)
`runAgent(goal, { llm, registry }, options)`:
- **Plan** — one LLM call with a `submit_plan` meta-tool decomposes the goal into ordered sub-tasks (fallback: parse a prose list; degenerate: goal-as-one-task).
- **Execute** — each sub-task runs a ReAct tool loop over the registry (≤`maxRoundsPerTask`); mutations return `changedBlockIds` (tracked changes).
- **Reflect** — a `submit_reflection` meta-tool judges goal completion and may append corrective tasks (≤`maxReflections`).
- Emits `AgentEvent`s (`plan`/`task-start`/`task-tool`/`task-end`/`reflect`/`done`) for the panel UX; honors an `AbortSignal`.
- Injected `LlmFn` → runs against Anthropic API, collab server, or desktop native model unchanged.

### 3. Real MCP (`mcp/`)
- **`RpcConnection`** — minimal JSON-RPC 2.0 over an injected `JsonRpcTransport` (stdio / WebSocket / in-memory): id correlation, timeouts, notifications.
- **`McpClient`** (`ToolSource`) — the client half: `initialize` → `tools/list` → `tools/call`, mapping MCP shapes to DocOps types. Lets the agent consume external MCP servers (web search, citations).
- **`McpServer`** — the protocol handler exposing an `McpToolProvider` (the DocOps catalog) to any MCP client (Claude Desktop, another agent, CLI).

Protocol version `2025-06-18`. Round-trip tested client↔server in-memory, including an MCP client registered alongside built-in tools in the agent registry.

## Remaining (wiring)

- **Agentic panel UX** (`DocOpsPanel`): register `DocsBridge` as a `ToolSource`, call `runAgent`, render the live plan + per-step status + reflection, cancel, all writes as tracked changes. Agentic vs single-shot toggle. Playwright-verify.
- **MCP host wiring:** connect `McpServer` to a desktop stdio pipe (external agents drive the doc) and a collab WebSocket; connect `McpClient` to user-configured external MCP servers, registered into the panel's `ToolRegistry`.
- Prompts/model tuning for the planner/reflection meta-tools on the local Qwen model (validate on-device).

## Tests
`packages/docops/src/agent/{registry,agent}.test.ts` (registry routing/collisions; plan-execute-reflect, corrective reflection, fallback, abort) + `mcp/mcp.test.ts` (client↔server round-trip, error mapping, registry integration). 13 tests, all green.
