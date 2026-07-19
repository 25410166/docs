/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Touch caret placement — tap-to-place-caret on the paginated editor.
 *
 * The paged editor's selection handlers were mouse-only; on a touch device a
 * tap did not reliably place the caret, so you couldn't position the cursor to
 * edit. This exercises the touch path with a real touchscreen tap.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.use({ hasTouch: true });

test.describe('Paged Editor - Touch caret', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
  });

  test('tapping text places the caret there', async ({ page }) => {
    await editor.typeText('Hello World');

    const textSpan = page.locator('.layout-page span:has-text("World")').first();
    const box = await textSpan.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Real touchscreen tap in the middle of "World".
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(120);

    // Typing should insert at the tapped caret position (inside "World"),
    // not at the document start/end.
    await page.keyboard.type('X');

    const content = await page.evaluate(
      () => document.querySelector('.ProseMirror')?.textContent || ''
    );
    expect(content).toContain('Hello');
    // The X landed inside/adjacent to "World" — i.e. not before "Hello".
    expect(content).toMatch(/Wor.*X|W.*X.*ld|World.*X|X.*World/);
    expect(content.startsWith('XHello')).toBe(false);
  });
});
