/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A block / topAndBottom image gets its own line, and the measurer starts a
 * fresh line after it for following content. When the image is the paragraph's
 * LAST run, that fresh line stayed empty and finalizeLine() (no empty-line
 * guard) pushed it — a phantom ~18px line + pagination drift. The trailing line
 * is now only started when there is more content.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { measureParagraph } from '../measureParagraph';
import { resetCanvasContext } from '../measureContainer';
import type { ParagraphBlock } from '../../../layout-engine/types';

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
});
afterAll(() => GlobalRegistrator.unregister());

const blockImage = { kind: 'image', wrapType: 'topAndBottom', width: 200, height: 120 };
const textRun = { kind: 'text', text: 'after the image' };

function measure(runs: unknown[]) {
  return measureParagraph(
    { kind: 'paragraph', id: 'p', pmStart: 0, pmEnd: 0, runs } as unknown as ParagraphBlock,
    400
  );
}

describe('trailing block image does not emit a phantom empty line', () => {
  test('a block image as the LAST run produces exactly one line (the image)', () => {
    expect(measure([blockImage]).lines.length).toBe(1);
  });

  test('a block image FOLLOWED by text still produces the image line + a text line', () => {
    // Guard that the trailing-line suppression only applies when the image is last.
    expect(measure([blockImage, textRun]).lines.length).toBe(2);
  });
});
