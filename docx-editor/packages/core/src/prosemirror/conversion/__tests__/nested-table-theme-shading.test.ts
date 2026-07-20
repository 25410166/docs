/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A nested table's cell shading that references a theme color (e.g.
 * `themeColor="accent1"`) must resolve to the document palette, just like a
 * top-level table. The nested convertTable call omitted the `theme` arg, so
 * `resolveColorToHex(themeFill, null)` returned undefined and the cell lost its
 * shading (fell back to no fill / the default palette).
 */

import { describe, expect, test } from 'bun:test';
import { toProseDoc } from '../toProseDoc';
import type { Node as PMNode } from 'prosemirror-model';
import type { Document, Theme } from '../../../types/document';

const THEME = {
  colorScheme: {
    dk1: '000000',
    lt1: 'FFFFFF',
    dk2: '44546A',
    lt2: 'E7E6E6',
    accent1: '4472C4',
    accent2: 'ED7D31',
    accent3: 'A5A5A5',
    accent4: 'FFC000',
    accent5: '5B9BD5',
    accent6: '70AD47',
    hlink: '0563C1',
    folHlink: '954F72',
  },
} as unknown as Theme;

function para(text: string) {
  return { type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text }] }] };
}

// Outer table → cell → NESTED table → cell shaded with themeColor accent1.
function docWithNestedThemedTable(): Document {
  const innerCell = {
    type: 'tableCell',
    content: [para('inner')],
    formatting: { shading: { fill: { themeColor: 'accent1' } } },
  };
  const nested = {
    type: 'table',
    rows: [{ type: 'tableRow', cells: [innerCell] }],
  };
  const outerCell = { type: 'tableCell', content: [nested], formatting: {} };
  const outer = { type: 'table', rows: [{ type: 'tableRow', cells: [outerCell] }] };
  return {
    package: { document: { content: [outer] }, theme: THEME },
  } as unknown as Document;
}

function cellBackgrounds(doc: PMNode): (string | null)[] {
  const bg: (string | null)[] = [];
  doc.descendants((n) => {
    if (n.type.name === 'tableCell') bg.push((n.attrs.backgroundColor as string) ?? null);
    return true;
  });
  return bg;
}

describe('nested table theme-color shading', () => {
  test('a nested cell resolves its themeColor fill to the document palette', () => {
    const backgrounds = cellBackgrounds(toProseDoc(docWithNestedThemedTable()));
    // The inner cell's accent1 fill must resolve to 4472C4 (was undefined before
    // the theme arg was threaded into the nested convertTable call).
    expect(
      backgrounds.some((c) => typeof c === 'string' && c.toUpperCase().includes('4472C4'))
    ).toBe(true);
  });
});
