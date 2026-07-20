/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Regression for "oversized / full-width floating image collapses text to ~1
 * char per line + height blowup".
 *
 * A floating image whose wrap exclusion spans (almost) the whole column used to
 * drive adjustedWidth to Math.max(1, …) = 1px, so text broke to one character
 * per line and the paragraph's height exploded, pushing following content off
 * the page. The text column is now floored to a minimum width.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { measureParagraph } from '../measureParagraph';
import { resetCanvasContext } from '../measureContainer';
import type { FloatingImageZone } from '../measureParagraph';
import type { ParagraphBlock, ParagraphMeasure } from '../../../layout-engine/types';

const MAX_WIDTH = 400;
const TEXT = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');

let noFloat: ParagraphMeasure;
let fullWidthFloat: ParagraphMeasure;

function para(): ParagraphBlock {
  return {
    kind: 'paragraph',
    id: 'p',
    pmStart: 0,
    pmEnd: 0,
    runs: [{ kind: 'text', text: TEXT }],
    attrs: { defaultFontSize: 12, defaultFontFamily: 'Arial' },
  } as unknown as ParagraphBlock;
}

beforeAll(() => {
  GlobalRegistrator.register();
  const fakeCtx = {
    font: '',
    measureText: (s: string) => ({
      width: s.length * 8,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 4,
    }),
  };
  // @ts-expect-error — deterministic canvas for measurement tests.
  HTMLCanvasElement.prototype.getContext = () => fakeCtx;
  resetCanvasContext();

  noFloat = measureParagraph(para(), MAX_WIDTH);
  // A zone that excludes the entire column for the whole paragraph height.
  const zone: FloatingImageZone = {
    leftMargin: MAX_WIDTH,
    rightMargin: 0,
    topY: 0,
    bottomY: 100000,
  };
  fullWidthFloat = measureParagraph(para(), MAX_WIDTH, { floatingZones: [zone] });
});
afterAll(() => GlobalRegistrator.unregister());

describe('full-width floating exclusion does not collapse the text column', () => {
  test('does not degenerate to ~1 character per line', () => {
    // Pre-fix: ~one char per line → line count near the character count.
    // Post-fix: floored to a real column → far fewer lines.
    const charCount = TEXT.length;
    expect(fullWidthFloat.lines.length).toBeLessThan(charCount / 4);
  });

  test('every line fits within a minimum column (no 1px collapse)', () => {
    // With an 8px/char stub and a ~96px floor, a filled line is ~10+ chars wide.
    const widest = Math.max(...fullWidthFloat.lines.map((l) => l.width));
    expect(widest).toBeGreaterThan(40);
  });

  test('the un-excluded paragraph still wraps normally (no behavior change)', () => {
    // Sanity: without a float, wrapping is unaffected by the floor.
    expect(noFloat.lines.length).toBeGreaterThan(0);
    expect(noFloat.lines.length).toBeLessThan(fullWidthFloat.lines.length);
  });
});
