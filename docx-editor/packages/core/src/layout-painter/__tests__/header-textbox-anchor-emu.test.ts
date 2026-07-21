/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * An anchored text box in a header/footer positions from `anchor.offsetH/offsetV`,
 * which are in EMUs (914400/inch). The header painter used them RAW as pixels,
 * so a 0.5" offset (457200) placed the box ~9525× too far — hurling the text box
 * and its text/tags right off the page. It must convert via emuToPixels like the
 * body text-box and header-image paths do.
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

// Header holding one page-anchored text box offset by `offsetEmu` on both axes.
function headerWithAnchoredTextBox(offsetEmu: number): HeaderFooterContent {
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
    anchor: { offsetH: offsetEmu, offsetV: offsetEmu, relFromH: 'page', relFromV: 'page' },
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
  test('offsetH/offsetV are converted EMU→px so the box stays on the page', () => {
    const page = makePage();
    // 1 inch = 914400 EMU = 96px. Page-relative → left = 96 - margins.left(96) = 0.
    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, headerContent: headerWithAnchoredTextBox(914400) }
    );

    const headerEl = el.querySelector(`.${PAGE_CLASS_NAMES.header}`);
    const tb = headerEl?.querySelector('.layout-textbox') as HTMLElement | null;
    expect(tb).toBeTruthy();

    const left = parseFloat(tb!.style.left);
    const top = parseFloat(tb!.style.top);

    // Before the fix these were ~914304 (raw EMU), far outside the 816×1056 page.
    expect(Math.abs(left)).toBeLessThanOrEqual(page.size.w);
    expect(Math.abs(top)).toBeLessThanOrEqual(page.size.h);
    // Concretely: 1" page-anchored, 1" left margin → left is exactly 0.
    expect(left).toBe(0);
  });
});
