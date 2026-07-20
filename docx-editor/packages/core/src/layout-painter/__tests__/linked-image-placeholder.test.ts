/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A linked (r:link) image, or one whose binary is missing, reaches the painter
 * with an empty src. It must render a soft placeholder instead of a broken
 * <img>. Pairs with runParser keeping rId-bearing-but-unresolved drawings
 * instead of dropping them.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderImageFragment } from '../renderImage';
import type { ImageFragment, ImageBlock, ImageMeasure } from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const fragment = {
  blockId: 'img1',
  width: 100,
  height: 80,
  isAnchored: false,
  pmStart: 0,
  pmEnd: 1,
  zIndex: 0,
} as unknown as ImageFragment;

function render(block: Partial<ImageBlock>): HTMLElement {
  return renderImageFragment(
    fragment,
    block as ImageBlock,
    {} as ImageMeasure,
    {} as RenderContext,
    { document }
  );
}

describe('renderImage — src-less (linked/unresolved) image', () => {
  test('renders a placeholder, not a broken <img>, when src is empty', () => {
    const el = render({ src: '' });
    expect(el.querySelector('img')).toBeNull();
    const placeholder = el.querySelector('div');
    expect(placeholder?.textContent).toBe('[Linked image]');
  });

  test('still renders an <img> for a normal embedded image', () => {
    const el = render({ src: 'data:image/png;base64,iVBORw0KGgo=' });
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('data:image/png');
  });
});
