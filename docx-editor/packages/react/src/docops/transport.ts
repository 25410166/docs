/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 *
 * Transport abstraction for DocOps LLM calls.
 *
 * Three concrete implementations:
 *  - DirectTransport  — browser fetch straight to Anthropic (Phase 0/1 default)
 *  - CollabTransport  — WebSocket to the collab server; SERVER holds the LLM
 *                       tool loop and routes tool_call messages back to this
 *                       client, which executes them via DocsBridge
 *  - DesktopTransport — Tauri invoke (native HTTP, keychain-ready)
 *
 * CollabTransport.drivesLoop === true: call() drives the complete multi-round
 * conversation internally. DirectTransport and DesktopTransport return a
 * single LLM round; the panel loops externally for those.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ToolExecutor = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export interface LlmCallPayload {
  model: string;
  system: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any;
  max_tokens: number;
  /** API key — required for DirectTransport; optional when the server holds one. */
  apiKey?: string;
  // ── collab-loop extras (only used when transport.drivesLoop === true) ──
  /** Executes a tool on behalf of the server and returns the result. */
  toolExecutor?: ToolExecutor;
  /** Called for each text block streamed by the server. */
  onText?: (text: string) => void;
  /** Abort signal — close the WS when aborted. */
  signal?: AbortSignal;
}

export interface LlmCallResult {
  /** Raw LLM response, or a synthetic `{ok:true}` for loop-driving transports. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  /** HTTP/WS status code. */
  status: number;
  /** Full conversation history after all tool rounds (only set by CollabTransport). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedHistory?: any[];
}

export interface DocOpsTransport {
  call(payload: LlmCallPayload): Promise<LlmCallResult>;
  /** True when an API key UI should be shown to the user. */
  readonly requiresApiKey: boolean;
  /**
   * True when the transport drives the full multi-round tool loop internally.
   * The panel must NOT run its own loop for these transports.
   */
  readonly drivesLoop: boolean;
}

// ── DirectTransport ────────────────────────────────────────────────────────

export class DirectTransport implements DocOpsTransport {
  readonly requiresApiKey = true;
  readonly drivesLoop = false;

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
      signal: payload.signal,
    });
    return { data: await resp.json(), status: resp.status };
  }
}

// ── CollabTransport ────────────────────────────────────────────────────────

/**
 * Routes AI orchestration through the collab server's `/api/ai` WebSocket.
 * The server holds the full LLM tool loop; when the model requests a tool
 * call, the server sends `{type:'tool_call', id, toolName, args}` back down
 * the same socket. This client executes the tool via `payload.toolExecutor`
 * and returns `{type:'tool_result', id, result}`. Text blocks stream as
 * `{type:'text', text}`. When the loop ends the server sends
 * `{type:'done', history}` and closes the connection.
 */
export class CollabTransport implements DocOpsTransport {
  readonly requiresApiKey = false;
  readonly drivesLoop = true;

  constructor(
    /** WebSocket URL for the AI endpoint, e.g. "wss://collab.example.com/api/ai". */
    private readonly aiWsUrl: string
  ) {}

  call(payload: LlmCallPayload): Promise<LlmCallResult> {
    return new Promise((resolve, reject) => {
      // Abort before even opening the socket.
      if (payload.signal?.aborted) {
        reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
        return;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(this.aiWsUrl);
      } catch (err) {
        reject(new Error(`Failed to open AI WebSocket: ${String(err)}`));
        return;
      }

      let settled = false;

      const settle = (v: LlmCallResult | null, err?: Error) => {
        if (settled) return;
        settled = true;
        payload.signal?.removeEventListener('abort', onAbort);
        if (err) reject(err);
        else resolve(v!);
      };

      const onAbort = () => {
        try {
          ws.close(1000, 'aborted');
        } catch {
          /* ignore */
        }
        settle(null, Object.assign(new Error('AbortError'), { name: 'AbortError' }));
      };
      payload.signal?.addEventListener('abort', onAbort);

      ws.addEventListener('open', () => {
        ws.send(
          JSON.stringify({
            type: 'chat',
            model: payload.model,
            max_tokens: payload.max_tokens,
            system: payload.system,
            messages: payload.messages,
            tools: payload.tools,
            ...(payload.apiKey ? { apiKey: payload.apiKey } : {}),
          })
        );
      });

      ws.addEventListener('message', ({ data }: MessageEvent<string>) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(data) as Record<string, unknown>;
        } catch {
          settle(null, new Error('AI WS: received non-JSON frame'));
          ws.close();
          return;
        }

        if (msg.type === 'text') {
          payload.onText?.(msg.text as string);
        } else if (msg.type === 'tool_call') {
          const id = msg.id as string;
          const toolName = msg.toolName as string;
          const args = (msg.args ?? {}) as Record<string, unknown>;

          if (!payload.toolExecutor) {
            ws.send(
              JSON.stringify({
                type: 'tool_result',
                id,
                error: 'no toolExecutor configured on this client',
              })
            );
            return;
          }

          payload
            .toolExecutor(toolName, args)
            .then((result) => {
              ws.send(JSON.stringify({ type: 'tool_result', id, result }));
            })
            .catch((err) => {
              ws.send(
                JSON.stringify({
                  type: 'tool_result',
                  id,
                  error: err instanceof Error ? err.message : String(err),
                })
              );
            });
        } else if (msg.type === 'done') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          settle({ data: { ok: true }, status: 200, updatedHistory: msg.history as any[] });
        } else if (msg.type === 'error') {
          settle({
            data: { error: { message: msg.message as string } },
            status: 500,
          });
        }
      });

      ws.addEventListener('error', () => {
        settle(null, new Error('AI WebSocket connection failed'));
      });

      ws.addEventListener('close', ({ code, reason }: CloseEvent) => {
        if (!settled) {
          if (code === 1000 || reason === 'aborted') return; // normal or intentional
          settle(null, new Error(`AI WebSocket closed unexpectedly (${code})`));
        }
      });
    });
  }
}

// ── DesktopTransport ───────────────────────────────────────────────────────

/**
 * Routes LLM calls through a Tauri command (`docops_llm_call`).
 * The API key stays out of the webview — the Rust side can read it from
 * the native keychain or a secure store.
 *
 * Falls back to DirectTransport when running outside the desktop shell
 * (dev mode, web build).
 */
export class DesktopTransport implements DocOpsTransport {
  readonly requiresApiKey = true;
  readonly drivesLoop = false;

  async call(payload: LlmCallPayload): Promise<LlmCallResult> {
    const tauri = (
      window as {
        __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__;

    if (!tauri?.invoke) {
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
 *  - Collab (ws URL)   → CollabTransport (derives /api/ai WS URL from the Yjs URL)
 *  - Otherwise         → DirectTransport
 */
export function createDocOpsTransport(opts?: { collabWsUrl?: string }): DocOpsTransport {
  const isDesktop = !!(window as { __deskApp__?: { isDesktop?: boolean } }).__deskApp__?.isDesktop;

  if (isDesktop) return new DesktopTransport();

  if (opts?.collabWsUrl) {
    // wss://host/yjs  →  wss://host/api/ai
    // ws://host/yjs   →  ws://host/api/ai
    const aiWsUrl = opts.collabWsUrl.replace(/\/yjs$/, '').replace(/\/+$/, '') + '/api/ai';
    return new CollabTransport(aiWsUrl);
  }

  return new DirectTransport();
}
