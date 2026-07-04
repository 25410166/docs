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
