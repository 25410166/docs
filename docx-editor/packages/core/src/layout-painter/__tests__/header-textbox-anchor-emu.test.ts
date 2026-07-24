/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * An anchored text box in a header/footer positions from `anchor.offsetH/offsetV`.
 * `toProseDoc.ts` converts these from EMU to pixels ONCE, at parse time, when it
 * builds the PM node's `posOffsetH`/`posOffsetV` attrs — every downstream reader
 * (`toFlowBlocks.ts`'s `TextBoxBlock.anchor`, and this renderer) receives pixels,
 * not EMU. The header painter used to run them through `emuToPixels()` a SECOND
 * time, treating an already-converted pixel value (e.g. 93px) as if it were EMU —
 * shrinking it to a fraction of a pixel (93 EMU ≈ 0.01px) and collapsing every
 * anchored header/footer text box toward the same spot regardless of its real
 * declared offset (visible as overlapping garbled text in real multi-shape
 * headers, e.g. a Chinese SDS document's title/product-code boxes).
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PAGE_CLASS_NAMES, renderPage, type HeaderFooterContent } from '../renderPage';
import type {
  Page,
  ParagraphBlock,
  ParagraphMeasure,
  TextBoxBlock,
  TextBoxMeasure,
} from '../../layout-engine/types';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function makePage(): Page {
  return {
    number: 1,
    fragments: [],
    margins: { top: 96, right: 96, bottom: 96, left: 96, header: 48, footer: 48 },
    size: { w: 816, h: 1056 },
  };
}

// Header holding one page-anchored text box offset by `offsetPx` (pixels — the
// unit `TextBoxBlock.anchor.offsetH/V` actually carries) on both axes.
function headerWithAnchoredTextBox(offsetPx: number): HeaderFooterContent {
  const innerPara: ParagraphBlock = {
    kind: 'paragraph',
    id: 'tb-para',
    runs: [],
    attrs: { defaultFontSize: 11, defaultFontFamily: 'Calibri' },
  };
  const innerMeasure: ParagraphMeasure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 0,
        width: 0,
        ascent: 11,
        descent: 4,
        lineHeight: 17.9,
      },
    ],
    totalHeight: 17.9,
  };
  const block: TextBoxBlock = {
    kind: 'textBox',
    id: 'tb1',
    width: 200,
    height: 100,
    content: [innerPara],
    anchor: { offsetH: offsetPx, offsetV: offsetPx, relFromH: 'page', relFromV: 'page' },
  };
  const measure: TextBoxMeasure = {
    kind: 'textBox',
    width: 200,
    height: 100,
    innerMeasures: [innerMeasure],
  };
  return { blocks: [block], measures: [measure], height: 100, visualTop: 0, visualBottom: 100 };
}

describe('renderPage header anchored text box positioning', () => {
  test('offsetH/offsetV (already pixels) are used as-is, not re-converted from EMU', () => {
    const page = makePage();
    // 1 inch = 96px. Page-relative → left = 96 - margins.left(96) = 0.
    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, headerContent: headerWithAnchoredTextBox(96) }
    );

    const headerEl = el.querySelector(`.${PAGE_CLASS_NAMES.header}`);
    const tb = headerEl?.querySelector('.layout-textbox') as HTMLElement | null;
    expect(tb).toBeTruthy();

    const left = parseFloat(tb!.style.left);
    const top = parseFloat(tb!.style.top);

    // Before the fix, re-running 96 through emuToPixels() collapsed this to ~0
    // regardless of the real offset — asserting the exact value (not just "in
    // bounds") is what catches that collapse.
    expect(left).toBe(0);
    // top = offV - flowTop, and flowTop = headerDistance = margins.header (48).
    expect(top).toBe(96 - 48);
  });

  test('a larger offset is NOT collapsed toward 0 (the double-EMU-conversion regression)', () => {
    const page = makePage();
    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, headerContent: headerWithAnchoredTextBox(300) }
    );

    const headerEl = el.querySelector(`.${PAGE_CLASS_NAMES.header}`);
    const tb = headerEl?.querySelector('.layout-textbox') as HTMLElement | null;
    expect(tb).toBeTruthy();

    const left = parseFloat(tb!.style.left);
    // Before the fix: emuToPixels(300) ≈ 0, so left ≈ -margins.left ≈ -96.
    // After the fix: left = 300 - margins.left(96) = 204.
    expect(left).toBe(300 - 96);
  });
});
