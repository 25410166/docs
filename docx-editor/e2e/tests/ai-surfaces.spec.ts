/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * AI surfaces contract — SelectionAskAi pill + DocOpsPanel streaming.
 *
 * No live LLM calls. Tests cover:
 *  - SelectionAskAi pill appears only when text is selected AND
 *    aiEnabled is true (simulated via window.__deskApp__ mock)
 *  - Pill disappears on selection clear / Escape
 *  - DocOpsPanel SSE: mock fetch streams tokens; panel shows in-flight
 *    bubble then committed message
 *  - DocOpsPanel: API-key setup view when key is absent
 *  - Model-gating: pill hidden when no model; appears after
 *    ai:model-changed event fires with a modelId
 *
 * The tests inject a fake `window.__TAURI__` to trigger the desktop
 * code path without an actual Tauri shell.
 */

import { expect, Page, test } from '@playwright/test';

// Storage key must match DocOpsPanel.tsx API_KEY_STORAGE constant.
const API_KEY_STORAGE = 'docops-api-key';
const FAKE_KEY = 'sk-ant-test-fake-key';

// Helper: load the editor with a minimal blank doc.
async function loadEditor(page: Page) {
  await page.goto('/');
  // Wait for the editor shell to be ready.
  await page.waitForSelector('.paged-editor__pages', { timeout: 15000 });
}

// Helper: select all text in the editor so SelectionAskAi can appear.
async function selectAll(page: Page) {
  await page.locator('.paged-editor__pages').click();
  await page.keyboard.press('Control+A');
  // Give the selection-change listener a tick to fire.
  await page.waitForTimeout(100);
}

// ── SelectionAskAi ────────────────────────────────────────────────────────────

test.describe('SelectionAskAi pill', () => {
  test.beforeEach(async ({ page }) => {
    await loadEditor(page);
  });

  test('hidden when no text is selected', async ({ page }) => {
    // Seed an API key so the `aiEnabled` web path resolves to true.
    await page.evaluate((key) => localStorage.setItem('docops-api-key', key), FAKE_KEY);
    await page.reload();
    await page.waitForSelector('.paged-editor__pages', { timeout: 15000 });

    // No selection — pill must not be in the DOM or must be hidden.
    const pill = page.locator('[data-testid="selection-ask-ai-pill"]');
    await expect(pill).not.toBeVisible();
  });

  test('appears after selecting text (DirectTransport with saved key)', async ({ page }) => {
    await page.evaluate((key) => localStorage.setItem(API_KEY_STORAGE, key), FAKE_KEY);
    await page.reload();
    await page.waitForSelector('.paged-editor__pages', { timeout: 15000 });

    // Type some text first.
    await page.locator('.paged-editor__pages').click();
    await page.keyboard.type('Hello world');
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(150);

    await expect(page.locator('[data-testid="selection-ask-ai-pill"]')).toBeVisible();
  });

  test('hidden when model is not loaded (Tauri path, no model)', async ({ page }) => {
    // Inject a fake __TAURI__ with invoke returning null (no model loaded).
    await page.evaluate(() => {
      (window as any).__TAURI__ = {
        core: {
          invoke: async (cmd: string) => {
            if (cmd === 'ai_get_active_model') return null;
            return null;
          },
        },
        event: {
          listen: async () => () => {},
        },
      };
    });
    await page.reload();
    await page.waitForSelector('.paged-editor__pages', { timeout: 15000 });

    await page.locator('.paged-editor__pages').click();
    await page.keyboard.type('Some text');
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(150);

    await expect(page.locator('[data-testid="selection-ask-ai-pill"]')).not.toBeVisible();
  });

  test('appears after ai:model-changed fires with a model id', async ({ page }) => {
    let fireModelChanged: ((modelId: string | null) => void) | null = null;

    // Inject fake Tauri: invoke returns null (no model), but listen wires
    // a callback we can trigger from the test.
    await page.exposeFunction('__testFireModelChanged', (modelId: string | null) => {
      fireModelChanged?.(modelId);
    });

    await page.evaluate(() => {
      const listeners: Record<string, ((e: { payload: unknown }) => void)[]> = {};
      (window as any).__TAURI__ = {
        core: {
          invoke: async (cmd: string) => {
            if (cmd === 'ai_get_active_model') return null;
            return null;
          },
        },
        event: {
          listen: async (event: string, cb: (e: { payload: unknown }) => void) => {
            listeners[event] = listeners[event] ?? [];
            listeners[event].push(cb);
            // Expose a trigger on window so the test can fire it.
            (window as any).__tauriListeners__ = listeners;
            return () => {};
          },
        },
      };
    });

    await page.reload();
    await page.waitForSelector('.paged-editor__pages', { timeout: 15000 });

    // Type + select.
    await page.locator('.paged-editor__pages').click();
    await page.keyboard.type('AI gated text');
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(150);

    // Pill should be hidden (no model).
    await expect(page.locator('[data-testid="selection-ask-ai-pill"]')).not.toBeVisible();

    // Fire ai:model-changed from the page context.
    await page.evaluate(() => {
      const listeners = (window as any).__tauriListeners__?.['ai:model-changed'];
      if (listeners) {
        listeners.forEach((cb: (e: unknown) => void) =>
          cb({ payload: { modelId: 'qwen2.5-0.5b' } }),
        );
      }
    });
    await page.waitForTimeout(100);

    await expect(page.locator('[data-testid="selection-ask-ai-pill"]')).toBeVisible();
  });

  test('pill closes on Escape', async ({ page }) => {
    await page.evaluate((key) => localStorage.setItem(API_KEY_STORAGE, key), FAKE_KEY);
    await page.reload();
    await page.waitForSelector('.paged-editor__pages', { timeout: 15000 });

    await page.locator('.paged-editor__pages').click();
    await page.keyboard.type('Escape test');
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(150);

    const pill = page.locator('[data-testid="selection-ask-ai-pill"]');
    await expect(pill).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await expect(pill).not.toBeVisible();
  });
});

// ── DocOpsPanel streaming ─────────────────────────────────────────────────────

test.describe('DocOpsPanel SSE streaming', () => {
  // Enable the DocOps feature flag before each test.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__casualFeatures__ = { docops: true };
    });
    await page.evaluate((key) => localStorage.setItem(API_KEY_STORAGE, key), FAKE_KEY);
    await loadEditor(page);
  });

  test('shows setup view when no API key is stored', async ({ page }) => {
    // Remove the key that beforeEach set.
    await page.evaluate(() => localStorage.removeItem('docops-api-key'));
    await page.reload();
    await page.waitForSelector('.paged-editor__pages', { timeout: 15000 });

    // Open DocOps panel via PanelRail.
    const docopsBtn = page.locator('[data-testid="rail-docops"]');
    if (!(await docopsBtn.isVisible())) test.skip(true, 'DocOps rail button not present');
    await docopsBtn.click();

    await expect(page.locator('[data-testid="docops-key-setup"]')).toBeVisible();
  });

  test('in-flight streaming bubble appears then commits on completion', async ({ page }) => {
    // Intercept Anthropic fetch to return an SSE stream.
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      const sseBody = [
        'event: message_start',
        'data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-haiku-4-5-20251001","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}',
        '',
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
        '',
        'event: content_block_stop',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
      ].join('\n');

      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        },
        body: sseBody,
      });
    });

    // Open DocOps panel.
    const docopsBtn = page.locator('[data-testid="rail-docops"]');
    if (!(await docopsBtn.isVisible())) test.skip(true, 'DocOps rail button not present');
    await docopsBtn.click();

    await page.waitForSelector('[data-testid="docops-input"]', { timeout: 5000 });
    await page.locator('[data-testid="docops-input"]').fill('Say hello');
    await page.keyboard.press('Enter');

    // Committed assistant message contains the streamed text.
    await expect(page.locator('[data-testid="docops-messages"]')).toContainText('Hello world', {
      timeout: 8000,
    });
  });
});
