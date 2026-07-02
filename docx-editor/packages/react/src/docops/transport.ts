/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 *
 * Transport abstraction for DocOps LLM calls.
 *
 * Three concrete implementations:
 *  - DirectTransport  — browser fetch straight to Anthropic (Phase 0/1 default)
 *  - CollabTransport  — proxy through the collab server /api/ai/chat
 *  - DesktopTransport — Tauri invoke (native HTTP, keychain-ready)
 */

export interface LlmCallPayload {
  model: string;
  system: string;
  messages: unknown;
  tools: unknown;
  max_tokens: number;
  /** API key — required for DirectTransport; optional when the server holds one. */
  apiKey?: string;
}

export interface LlmCallResult {
  /** Raw Anthropic messages-API response (or error envelope). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  /** HTTP status from upstream. */
  status: number;
}

export interface DocOpsTransport {
  call(payload: LlmCallPayload): Promise<LlmCallResult>;
  /** True when an API key UI should be shown to the user. */
  readonly requiresApiKey: boolean;
}

// ── DirectTransport ────────────────────────────────────────────────────────

export class DirectTransport implements DocOpsTransport {
  readonly requiresApiKey = true;

  async call(payload: LlmCallPayload): Promise<LlmCallResult> {
    if (!payload.apiKey) {
      return { data: { error: { message: 'No API key configured.' } }, status: 401 };
    }
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': payload.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: payload.model,
        max_tokens: payload.max_tokens,
        system: payload.system,
        messages: payload.messages,
        tools: payload.tools,
      }),
    });
    return { data: await resp.json(), status: resp.status };
  }
}

// ── CollabTransport ────────────────────────────────────────────────────────

/**
 * Routes LLM calls through the collab server's /api/ai/chat endpoint.
 * The server holds the Anthropic API key; the user doesn't need one.
 * BYO-key fallback: if the server has no key configured it returns 503
 * and the panel falls back to prompting for a key.
 */
export class CollabTransport implements DocOpsTransport {
  readonly requiresApiKey = false;

  constructor(
    /** HTTP base URL of the collab server, e.g. "https://collab.example.com". */
    private readonly baseUrl: string,
    /** Optional BYO key — sent in the body; ignored if the server has its own key. */
    private readonly fallbackApiKey?: string
  ) {}

  async call(payload: LlmCallPayload): Promise<LlmCallResult> {
    const body: Record<string, unknown> = {
      model: payload.model,
      max_tokens: payload.max_tokens,
      system: payload.system,
      messages: payload.messages,
      tools: payload.tools,
    };
    if (payload.apiKey ?? this.fallbackApiKey) {
      body.apiKey = payload.apiKey ?? this.fallbackApiKey;
    }
    const resp = await fetch(`${this.baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include', // carry session cookies for personal-mode auth
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    // Server returned 503 "no_api_key" — signal that we need a key from the user.
    if (resp.status === 503 && (data as { error?: string }).error === 'no_api_key') {
      return { data, status: 503 };
    }
    return { data, status: resp.status };
  }
}

// ── DesktopTransport ───────────────────────────────────────────────────────

/**
 * Routes LLM calls through a Tauri command (`docops_llm_call`).
 * This keeps the API key out of the webview entirely — the Rust side
 * can read it from the native keychain or a secure store.
 *
 * Falls back to DirectTransport when Tauri is not detected (dev mode
 * running the web build outside of the desktop shell).
 */
export class DesktopTransport implements DocOpsTransport {
  readonly requiresApiKey = true;

  async call(payload: LlmCallPayload): Promise<LlmCallResult> {
    const tauri = (
      window as {
        __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__;

    if (!tauri?.invoke) {
      // Not running inside the desktop shell — fall back to direct.
      return new DirectTransport().call(payload);
    }

    try {
      const data = await tauri.invoke('docops_llm_call', {
        messages: payload.messages,
        tools: payload.tools,
        model: payload.model,
        system: payload.system,
        maxTokens: payload.max_tokens,
        apiKey: payload.apiKey ?? '',
      });
      return { data, status: 200 };
    } catch (err) {
      return {
        data: { error: { message: String(err) } },
        status: 500,
      };
    }
  }
}

// ── factory ────────────────────────────────────────────────────────────────

/**
 * Picks the right transport for the current environment.
 *  - Desktop (Tauri)   → DesktopTransport
 *  - Collab (ws URL)   → CollabTransport (derives HTTP base from the WS URL)
 *  - Otherwise         → DirectTransport
 */
export function createDocOpsTransport(opts?: { collabWsUrl?: string }): DocOpsTransport {
  const isDesktop = !!(window as { __deskApp__?: { isDesktop?: boolean } }).__deskApp__?.isDesktop;

  if (isDesktop) return new DesktopTransport();

  if (opts?.collabWsUrl) {
    const httpBase = opts.collabWsUrl
      .replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://'))
      .replace(/\/yjs$/, '');
    return new CollabTransport(httpBase);
  }

  return new DirectTransport();
}
