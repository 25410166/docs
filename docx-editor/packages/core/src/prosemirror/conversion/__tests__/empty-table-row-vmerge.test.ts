/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A table row whose cells are ALL vMerge="continue" (fully covered by a
 * vertical merge from the row above) used to skip every cell, producing an
 * empty <tableRow>. That is invalid for the schema ((tableCell | tableHeader)+)
 * and threw "Invalid content for node tableRow" during conversion — crashing
 * the ENTIRE document on open. A spanning placeholder cell now keeps the row
 * valid.
 */

import { describe, expect, test } from 'bun:test';
import { toProseDoc } from '../toProseDoc';
import type { Document } from '../../../types/document';

function cell(vMerge?: 'restart' | 'continue') {
  return {
    type: 'tableCell',
    content: [
      { type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'x' }] }] },
    ],
    formatting: vMerge ? { vMerge } : {},
  };
}

// 1-column table with a 3-row vertical merge → rows 2 and 3 are fully covered.
function docWithFullyMergedRows(): Document {
  return {
    package: {
      document: {
        content: [
          {
            type: 'table',
            rows: [
              { type: 'tableRow', cells: [cell('restart')] },
              { type: 'tableRow', cells: [cell('continue')] },
              { type: 'tableRow', cells: [cell('continue')] },
            ],
          },
        ],
      },
    },
  } as unknown as Document;
}

describe('table row fully covered by a vertical merge', () => {
  test('does not throw (no document-crash on open)', () => {
    expect(() => toProseDoc(docWithFullyMergedRows())).not.toThrow();
  });

  test('every row is schema-valid (>= 1 cell) and the doc passes check()', () => {
    const pm = toProseDoc(docWithFullyMergedRows());
    const rowCellCounts: number[] = [];
    pm.descendants((n) => {
      if (n.type.name === 'tableRow') rowCellCounts.push(n.childCount);
      return true;
    });
    expect(rowCellCounts.length).toBe(3);
    expect(rowCellCounts.every((c) => c >= 1)).toBe(true);
    expect(() => pm.check()).not.toThrow();
  });
});
