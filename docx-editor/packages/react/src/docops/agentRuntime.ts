/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Wiring that connects the transport-agnostic agent core in @casualoffice/docops
 * to the panel's concrete runtime: the DocsBridge becomes a ToolSource, and the
 * panel's DocOpsTransport becomes the injected LlmFn. External MCP clients can
 * be registered into the same registry so their tools join the agent's catalog.
 */

import {
  DOCOPS_CATALOG,
  ToolRegistry,
  type LlmFn,
  type LlmResponse,
  type ToolSource,
} from '@casualoffice/docops';
import type { DocsBridge } from './bridge';
import type { DocOpsTransport } from './transport';

/** Adapt the in-process DocsBridge to a ToolSource. */
export function bridgeToolSource(bridge: DocsBridge): ToolSource {
  return {
    id: 'docops',
    listTools: () => DOCOPS_CATALOG,
    callTool: (name, args) => bridge.callTool(name, args),
  };
}

/**
 * Build the agent's tool registry: the built-in DocOps tools first (so they win
 * name collisions), then any external MCP `ToolSource`s the user configured.
 */
export function createAgentRegistry(bridge: DocsBridge, extra: ToolSource[] = []): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(bridgeToolSource(bridge));
  for (const source of extra) registry.register(source);
  return registry;
}

/**
 * Adapt a single-round DocOpsTransport to the agent's LlmFn. Only valid for
 * transports that do NOT drive their own loop (Direct/Desktop) — the agent owns
 * the loop. Throws on a non-200 so the agent surfaces the real error.
 */
export function transportLlm(
  transport: DocOpsTransport,
  opts: { model: string; apiKey?: string; maxTokens?: number }
): LlmFn {
  return async ({ system, messages, tools, onText, signal }) => {
    const { data, status } = await transport.call({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      system,
      messages,
      tools: tools ?? [],
      apiKey: opts.apiKey || undefined,
      signal,
      onText,
    });
    if (status !== 200) {
      const message =
        (data as { error?: { message?: string } })?.error?.message ?? `API error ${status}`;
      throw new Error(message);
    }
    return data as LlmResponse;
  };
}
