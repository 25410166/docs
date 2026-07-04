/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

export type {
  Locator,
  DocOpsErrorCode,
  DocOpsSuccess,
  DocOpsError,
  DocOpsResult,
  DocOpsTool,
} from './types';

export { DOCOPS_CATALOG } from './catalog';

// Agentic layer: plan → execute → reflect over a pluggable tool registry.
export { ToolRegistry, runAgent } from './agent';
export type {
  ToolSource,
  AgentEvent,
  AgentOptions,
  AgentResult,
  AgentTask,
  TaskStatus,
  LlmContentBlock,
  LlmFn,
  LlmMessage,
  LlmResponse,
} from './agent';

// Real Model Context Protocol: client (consume external servers) + server
// (expose the DocOps tools to external agents), over any JSON-RPC transport.
export { RpcConnection, McpClient, McpServer } from './mcp';
export type { JsonRpcTransport, McpClientOptions, McpToolProvider, McpServerOptions } from './mcp';
