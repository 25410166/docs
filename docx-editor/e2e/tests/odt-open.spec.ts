/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ODT open from the Home picker.
 *
 * The Home file picker was DOCX-only (`accept=".docx"`) and `handleOpenFromHome`
 * fed the raw bytes straight to the parser, so picking a `.odt` either couldn't
 * be selected or rendered as garbage. The fix widens the accept list and routes
 * foreign formats (.odt/.md/.txt) through the WASM converter before the editor
 * loads them — mirroring the editor's own File → Open path.
 *
 * This drives the REAL Home picker → WASM conversion → painted pages, asserting
 * the document's text actually rendered (proving the convert-to-DOCX round-trip
 * ran, not just that a file was accepted).
 */

const ODT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'casual-sample.odt');

test('opens a .odt file from the Home picker and renders its text', async ({ page }) => {
  // The 7 MB WASM converter dominates this test's wall-clock; give the whole
  // test a budget wide enough that its slower-path load can't trip the default
  // per-test timeout (the root of the odt-open flake).
  test.setTimeout(120000);
  // Plain `/` lands on Home; `?e2e=1` would force the editor and skip the picker.
  await page.goto('/');

  // Home view renders the picker (DOCX-only accept would have excluded .odt).
  const fileInput = page.getByTestId('home-file-input');
  await expect(fileInput).toHaveAttribute('accept', /\.odt/);

  await fileInput.setInputFiles(ODT_FIXTURE);

  // Editor mounts once the WASM converter returns DOCX bytes. The 7 MB WASM is
  // lazy-loaded on first conversion and — when the dev server serves it without
  // the application/wasm MIME — instantiation falls back to the slower
  // non-streaming path, which on a loaded CI runner intermittently blew the old
  // 45 s window (the long-standing odt-open flake). Widen the mount + text
  // windows so WASM-load timing variance stops producing false failures.
  await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 90000 });
  await page.waitForFunction(() => document.fonts.ready);

  // The converted document's text must appear in the painted pages — this is
  // the real proof the .odt was decoded, not just accepted.
  const pages = page.locator('.paged-editor__pages');
  await expect(pages).toContainText('Casual ODT Fixture Heading', { timeout: 30000 });
  await expect(pages).toContainText('This paragraph proves ODT open works end to end');
});
