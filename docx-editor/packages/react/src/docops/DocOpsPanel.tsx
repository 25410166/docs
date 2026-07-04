/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * DocOpsPanel — AI document assistant backed by the JSON DocOps IR.
 *
 * Phase 0: in-process Anthropic tool loop, user-supplied API key.
 * Phase 2: pluggable transport (DirectTransport / CollabTransport /
 *           DesktopTransport) — the panel no longer calls Anthropic
 *           directly; it delegates to whatever transport is passed in.
 *
 * Architecture: the panel sends messages via the transport with the
 * DOCOPS_CATALOG tools. When the model calls a tool, DocsBridge
 * reads/writes the PM doc. The loop continues until stop_reason =
 * 'end_turn'.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { RightDockPanel } from '../components/RightDockPanel';
import { MaterialSymbol } from '../components/ui/Icons';
import type { DocsBridge } from './bridge';
import { DOCOPS_CATALOG } from '@casualoffice/docops';
import {
  DirectTransport,
  type DocOpsTransport,
  type LlmCallPayload,
  type ToolExecutor,
} from './transport';

// ── LLM wire types (messages-API shape) ───────────────────────────────────

type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface LlmMessage {
  role: 'user' | 'assistant';
  content: LlmContentBlock[] | string;
}

interface LlmResponse {
  content: LlmContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
}

// ── Display message types ──────────────────────────────────────────────────

type DisplayMessage =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool_step'; toolName: string; status: 'running' | 'done' | 'error' }
  | { kind: 'error'; text: string }
  | { kind: 'cap'; rounds: number };

// ── Constants ─────────────────────────────────────────────────────────────

const API_KEY_STORAGE = 'casual_docops_api_key';
const MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOOL_ROUNDS = 12;

const SYSTEM_PROMPT = `You are DocOps, an AI assistant inside a .docx editor.

IMPORTANT: You do not have the document text. It is not in this chat. You are the one who calls tools — the user never runs tools. When you need information about the document, YOU emit a <tool_call> block and the editor runs it and returns the result to you.

Read tools (inspect the document — never mutate):
- get_doc_stats() — returns word/paragraph/table/image counts AND the FULL document text. Call this to summarize, describe, or answer "what is this about".
- get_outline() — returns the heading tree.
- get_selection() — returns the user's currently selected text.
- find_text(query) — searches the document for a phrase.
- list_styles() — lists paragraph styles and fonts used.

Write tools — direct edits (immediately visible):
- convert_range_to_table — user must have the text selected first
- insert_toc — inserts at the cursor position

Write tools — suggestion mode (user reviews in the sidebar):
- suggest_text_change, set_paragraph_style, add_comment, rewrite_selection (call get_selection first), delete_paragraphs (pass paraIds from get_outline/find_text), insert_paragraph_after, harmonize_styles (call list_styles first), insert_report_from_data, create_document (call get_doc_stats first, confirm wordCount === 0)

Rules:
- To summarize, describe, or answer ANY question about the document, your VERY FIRST response must be a <tool_call> for get_doc_stats. Do not write prose first. Do not ask the user to do anything. Do not assume or invent the document's content.
- Emit exactly this and nothing else, then stop:
<tool_call>
{"name": "get_doc_stats", "arguments": {}}
</tool_call>
- After the tool result arrives, write a short, plain-language answer.
- Always read before you write. For suggest_text_change the search text must be exact (case-sensitive) — call find_text first. For rewrite_selection, call get_selection first.
- Tracked changes appear in the comments sidebar — tell the user to open it to review.
- Keep responses short. Users want results, not explanations.`;

// ── Styles ────────────────────────────────────────────────────────────────

const messagesStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const msgUserStyle: CSSProperties = {
  alignSelf: 'flex-end',
  maxWidth: '85%',
  background: 'var(--doc-primary, #1a73e8)',
  color: '#fff',
  borderRadius: '12px 12px 2px 12px',
  padding: '8px 12px',
  fontSize: 13,
  lineHeight: 1.45,
  wordBreak: 'break-word',
};

const msgAssistantStyle: CSSProperties = {
  alignSelf: 'flex-start',
  maxWidth: '95%',
  background: 'var(--doc-surface-sunken, #f8f9fa)',
  color: 'var(--doc-text)',
  border: '1px solid var(--doc-border-light)',
  borderRadius: '2px 12px 12px 12px',
  padding: '8px 12px',
  fontSize: 13,
  lineHeight: 1.55,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
};

const msgToolStyle: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11.5,
  color: 'var(--doc-text-muted)',
  padding: '2px 0',
};

const msgErrorStyle: CSSProperties = {
  alignSelf: 'flex-start',
  maxWidth: '95%',
  background: 'var(--doc-danger-bg, #fef2f2)',
  color: 'var(--doc-danger, #c62828)',
  border: '1px solid var(--doc-danger-border, #fca5a5)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  lineHeight: 1.45,
};

const msgCapStyle: CSSProperties = {
  alignSelf: 'center',
  fontSize: 11.5,
  color: 'var(--doc-text-muted)',
  padding: '3px 10px',
  borderRadius: 6,
  background: 'var(--doc-surface-sunken, #f8f9fa)',
  border: '1px solid var(--doc-border-light)',
};

const inputRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '10px 12px',
  alignItems: 'flex-end',
};

// One-tap prompts for the most common document actions, so the panel isn't a
// blank chat box. Each seeds a natural-language prompt the model + DocOps tool
// catalog (summarize, rewrite_selection, convert-to-table, outline/TOC) handle.
const QUICK_ACTIONS: ReadonlyArray<{ id: string; label: string; prompt: string }> = [
  {
    id: 'summarize',
    label: 'Summarize',
    prompt: 'Summarize this document in a few clear sentences.',
  },
  {
    id: 'rewrite',
    label: 'Rewrite selection',
    prompt: 'Rewrite the currently selected text to be clearer and more polished.',
  },
  {
    id: 'table',
    label: 'Make table',
    prompt: 'Convert the currently selected text into a well-structured table.',
  },
  { id: 'outline', label: 'Outline', prompt: 'Give me a concise outline of this document.' },
];

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  padding: '8px 12px 0',
};

const chipStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  padding: '5px 10px',
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 999,
  background: 'var(--doc-surface, #ffffff)',
  color: 'var(--doc-text)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const textareaStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  lineHeight: 1.45,
  padding: '8px 10px',
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 8,
  outline: 'none',
  resize: 'none',
  background: 'var(--doc-surface, #ffffff)',
  color: 'var(--doc-text)',
  font: 'inherit',
  maxHeight: 120,
  overflowY: 'auto',
};

const sendBtnStyle = (busy: boolean): CSSProperties => ({
  padding: '8px 12px',
  borderRadius: 8,
  border: 'none',
  background: busy ? 'var(--doc-border, #d1d5db)' : 'var(--doc-primary, #1a73e8)',
  color: busy ? 'var(--doc-text-muted)' : '#fff',
  cursor: busy ? 'not-allowed' : 'pointer',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 120ms',
});

const keySetupStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '20px 16px',
};

const keyInputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 8,
  outline: 'none',
  background: 'var(--doc-surface, #ffffff)',
  color: 'var(--doc-text)',
  font: 'inherit',
  boxSizing: 'border-box',
};

const saveBtnStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: '7px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--doc-primary, #1a73e8)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

// ── Spinner ────────────────────────────────────────────────────────────────

const spinnerStyle: CSSProperties = {
  display: 'inline-block',
  width: 10,
  height: 10,
  border: '2px solid currentColor',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'docops-spin 0.7s linear infinite',
};

// ── Component ─────────────────────────────────────────────────────────────

export interface DocOpsPanelProps {
  bridge: DocsBridge;
  onClose: () => void;
  /** LLM transport — defaults to DirectTransport (browser fetch to Anthropic). */
  transport?: DocOpsTransport;
  /**
   * Maximum number of LLM tool-call rounds per message before the loop is
   * stopped and the user is notified. Defaults to 12.
   */
  maxToolRounds?: number;
}

export function DocOpsPanel({
  bridge,
  onClose,
  transport: transportProp,
  maxToolRounds: maxToolRoundsProp,
}: DocOpsPanelProps) {
  const transport = transportProp ?? new DirectTransport();
  const maxToolRounds = maxToolRoundsProp ?? DEFAULT_MAX_TOOL_ROUNDS;
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [keyDraft, setKeyDraft] = useState('');
  // Show setup screen only for transports that require a key AND none is stored.
  const [showKeySetup, setShowKeySetup] = useState(
    () => transport.requiresApiKey && !localStorage.getItem(API_KEY_STORAGE)
  );

  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [busy, setBusy] = useState(false);

  // Anthropic conversation history (separate from display)
  const historyRef = useRef<LlmMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const appendDisplay = useCallback((msg: DisplayMessage) => {
    setDisplayMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastToolStep = useCallback((status: 'done' | 'error') => {
    setDisplayMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].kind === 'tool_step') {
          copy[i] = { ...(copy[i] as Extract<DisplayMessage, { kind: 'tool_step' }>), status };
          break;
        }
      }
      return copy;
    });
  }, []);

  const saveKey = useCallback(() => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    localStorage.setItem(API_KEY_STORAGE, trimmed);
    setApiKey(trimmed);
    setKeyDraft('');
    setShowKeySetup(false);
  }, [keyDraft]);

  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? inputValue).trim();
      if (!text || busy) return;
      // Block send if key is required and missing.
      if (transport.requiresApiKey && !apiKey) return;

      setInputValue('');
      setBusy(true);

      appendDisplay({ kind: 'user', text });
      historyRef.current = [...historyRef.current, { role: 'user', content: text }];

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        if (transport.drivesLoop) {
          // ── Collab transport: server holds the LLM loop ──────────────────
          // tool_call messages are routed back over WS; we execute via
          // DocsBridge and return the results to the server.
          const toolExecutor: ToolExecutor = async (toolName, args) => {
            appendDisplay({ kind: 'tool_step', toolName, status: 'running' });
            try {
              const result = await bridge.callTool(toolName, args);
              updateLastToolStep('done');
              return result;
            } catch (err) {
              updateLastToolStep('error');
              throw err;
            }
          };

          const payload: LlmCallPayload = {
            model: MODEL,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: historyRef.current,
            tools: DOCOPS_CATALOG,
            apiKey: apiKey || undefined,
            signal: ctrl.signal,
            maxToolRounds,
            toolExecutor,
            onText: (text) => {
              if (text.trim()) appendDisplay({ kind: 'assistant', text });
            },
          };

          const { data, status, updatedHistory, capHit } = await transport.call(payload);

          if (status !== 200) {
            const errMsg = (data as { error?: { message?: string } })?.error?.message;
            throw new Error(errMsg ?? `AI error ${status}`);
          }
          if (updatedHistory) historyRef.current = updatedHistory as LlmMessage[];
          if (capHit) appendDisplay({ kind: 'cap', rounds: maxToolRounds });
        } else {
          // ── Direct / Desktop transport: panel drives the loop ────────────
          let messages = [...historyRef.current];
          let panelCapHit = false;

          for (let round = 0; round < maxToolRounds; round++) {
            if (ctrl.signal.aborted) break;

            let streamedText = '';
            const payload: LlmCallPayload = {
              model: MODEL,
              max_tokens: 2048,
              system: SYSTEM_PROMPT,
              messages,
              tools: DOCOPS_CATALOG,
              apiKey: apiKey || undefined,
              signal: ctrl.signal,
              maxToolRounds,
              onText: (tok) => {
                if (tok) {
                  streamedText += tok;
                  setStreamingText((prev) => prev + tok);
                }
              },
            };

            const { data, status } = await transport.call(payload);

            // Flush any streamed tokens as a single committed message,
            // then clear the in-flight indicator.
            if (streamedText.trim()) {
              appendDisplay({ kind: 'assistant', text: streamedText });
            }
            setStreamingText('');

            if (status !== 200) {
              const errMsg = (data as { error?: { message?: string } })?.error?.message;
              throw new Error(errMsg ?? `API error ${status}`);
            }

            const response = data as LlmResponse;

            messages = [...messages, { role: 'assistant', content: response.content }];

            // Emit text blocks only when nothing was streamed via onText
            // (i.e. the transport returned a complete response at once).
            if (!streamedText) {
              for (const block of response.content) {
                if (block.type === 'text' && block.text.trim()) {
                  appendDisplay({ kind: 'assistant', text: block.text });
                }
              }
            }

            if (response.stop_reason !== 'tool_use') break;

            const toolResults: LlmContentBlock[] = [];
            for (const block of response.content) {
              if (block.type !== 'tool_use') continue;

              appendDisplay({ kind: 'tool_step', toolName: block.name, status: 'running' });
              try {
                const result = await bridge.callTool(block.name, block.input);
                updateLastToolStep('done');
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                });
              } catch (err) {
                updateLastToolStep('error');
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify({
                    ok: false,
                    code: 'UNSUPPORTED',
                    message: err instanceof Error ? err.message : String(err),
                    retryable: false,
                  }),
                });
              }
            }

            messages = [...messages, { role: 'user', content: toolResults }];

            if (round === maxToolRounds - 1) {
              panelCapHit = true;
            }
          }

          if (panelCapHit) appendDisplay({ kind: 'cap', rounds: maxToolRounds });
          historyRef.current = messages;
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : String(err);
        appendDisplay({ kind: 'error', text: msg });
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [inputValue, busy, apiKey, transport, bridge, appendDisplay, updateLastToolStep]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setDisplayMessages([]);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const headerActions = (
    <>
      {displayMessages.length > 0 && (
        <button
          type="button"
          onClick={clearHistory}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--doc-text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '2px 6px',
            borderRadius: 4,
          }}
          title="Clear conversation"
          disabled={busy}
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={() => setShowKeySetup((v) => !v)}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--doc-text-muted)',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4,
          display: 'inline-flex',
          alignItems: 'center',
        }}
        title={showKeySetup ? 'Back to chat' : 'API key settings'}
      >
        <MaterialSymbol name="settings" size={15} />
      </button>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes docops-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <RightDockPanel
        title="DocOps AI"
        icon={<MaterialSymbol name="auto_awesome" size={16} />}
        headerActions={headerActions}
        onClose={onClose}
        testId="docops-panel"
        footer={
          showKeySetup ? undefined : (
            <div>
              {!busy && (
                <div style={chipRowStyle}>
                  {QUICK_ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      style={chipStyle}
                      onClick={() => void send(a.prompt)}
                      disabled={busy || (transport.requiresApiKey && !apiKey)}
                      data-testid={`docops-quick-${a.id}`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
              <div style={inputRowStyle}>
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={busy ? 'Working…' : 'Ask about your document… (Enter to send)'}
                  rows={1}
                  style={textareaStyle}
                  disabled={busy}
                  data-testid="docops-input"
                />
                {busy ? (
                  <button
                    type="button"
                    style={sendBtnStyle(false)}
                    onClick={stop}
                    title="Stop"
                    data-testid="docops-stop"
                  >
                    <MaterialSymbol name="close" size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    style={sendBtnStyle(!inputValue.trim())}
                    onClick={() => void send()}
                    disabled={!inputValue.trim()}
                    title="Send (Enter)"
                    data-testid="docops-send"
                  >
                    <MaterialSymbol name="keyboard_arrow_right" size={16} />
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {showKeySetup ? (
          <div style={keySetupStyle} data-testid="docops-key-setup">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--doc-text)', lineHeight: 1.5 }}>
              DocOps uses the Anthropic API. Bring your own key — it&apos;s stored only in this
              browser&apos;s localStorage.
            </p>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveKey();
              }}
              placeholder={apiKey ? '••••••••  (key saved — paste new to replace)' : 'sk-ant-…'}
              style={keyInputStyle}
              autoFocus
              data-testid="docops-api-key-input"
            />
            <button
              type="button"
              style={saveBtnStyle}
              onClick={saveKey}
              disabled={!keyDraft.trim()}
            >
              Save key
            </button>
            {apiKey && (
              <button
                type="button"
                style={{
                  ...saveBtnStyle,
                  background: 'transparent',
                  color: 'var(--doc-danger, #c62828)',
                  border: '1px solid var(--doc-danger, #c62828)',
                  marginTop: 4,
                }}
                onClick={() => {
                  localStorage.removeItem(API_KEY_STORAGE);
                  setApiKey('');
                  setShowKeySetup(true);
                }}
              >
                Remove key
              </button>
            )}
          </div>
        ) : (
          <div style={messagesStyle} data-testid="docops-messages">
            {displayMessages.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 16px',
                  color: 'var(--doc-text-muted)',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <MaterialSymbol
                  name="auto_awesome"
                  size={28}
                  style={{ marginBottom: 8, opacity: 0.5 }}
                />
                <p style={{ margin: '8px 0 0' }}>
                  Ask anything about your document — outline, stats, styles, find text — or have it
                  convert a selection to a table or insert a TOC.
                </p>
              </div>
            )}

            {displayMessages.map((msg, i) => {
              if (msg.kind === 'user') {
                return (
                  <div key={i} style={msgUserStyle}>
                    {msg.text}
                  </div>
                );
              }
              if (msg.kind === 'assistant') {
                return (
                  <div key={i} style={msgAssistantStyle}>
                    {msg.text}
                  </div>
                );
              }
              if (msg.kind === 'tool_step') {
                return (
                  <div key={i} style={msgToolStyle}>
                    {msg.status === 'running' ? (
                      <span style={spinnerStyle} aria-hidden="true" />
                    ) : msg.status === 'done' ? (
                      <MaterialSymbol name="check" size={12} />
                    ) : (
                      <MaterialSymbol name="close" size={12} />
                    )}
                    <span>{TOOL_LABELS[msg.toolName] ?? msg.toolName}</span>
                  </div>
                );
              }
              if (msg.kind === 'error') {
                return (
                  <div key={i} style={msgErrorStyle}>
                    {msg.text}
                  </div>
                );
              }
              if (msg.kind === 'cap') {
                return (
                  <div key={i} style={msgCapStyle}>
                    Stopped after {msg.rounds} tool steps — send another message to continue.
                  </div>
                );
              }
              return null;
            })}

            {streamingText && (
              <div style={{ ...msgAssistantStyle, opacity: 0.85 }}>
                {streamingText}
                <span style={spinnerStyle} aria-hidden="true" />
              </div>
            )}

            {!apiKey && displayMessages.length === 0 && (
              <div
                style={{
                  margin: '0 0 8px',
                  padding: '10px 12px',
                  background: 'var(--doc-surface-sunken, #f8f9fa)',
                  border: '1px solid var(--doc-border-light)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--doc-text-muted)',
                }}
              >
                No API key saved. Click the settings icon above to add one.
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </RightDockPanel>
    </>
  );
}

const TOOL_LABELS: Record<string, string> = {
  get_outline: 'Reading outline…',
  get_selection: 'Reading selection…',
  get_doc_stats: 'Reading stats…',
  list_styles: 'Reading styles…',
  find_text: 'Searching…',
  convert_range_to_table: 'Converting to table…',
  insert_toc: 'Inserting TOC…',
  suggest_text_change: 'Suggesting change…',
  set_paragraph_style: 'Applying style…',
  add_comment: 'Adding comment…',
  rewrite_selection: 'Rewriting selection…',
  delete_paragraphs: 'Marking for deletion…',
  insert_paragraph_after: 'Inserting paragraph…',
  get_block: 'Reading block…',
  harmonize_styles: 'Harmonizing styles…',
  insert_report_from_data: 'Building report table…',
  create_document: 'Building document…',
};

export default DocOpsPanel;
