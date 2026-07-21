/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A comment anchored just AFTER a hyperlink used to lose its anchor on save.
 * `extractParagraphContent` coalesces a multi-node hyperlink into ONE content
 * item, but `insertCommentRanges` walked PM children 1:1 into that (shorter)
 * array — so after a multi-node link the index desynced and the
 * commentRangeStart/End landed around the wrong item, collapsing to an empty
 * range with the commented text left outside it. These round-trip the OOXML
 * model → PM → model and assert the commented run sits INSIDE its range.
 */

import { describe, expect, test } from 'bun:test';
import { toProseDoc } from '../toProseDoc';
import { fromProseDoc } from '../fromProseDoc';
import type {
  Document,
  Paragraph,
  Hyperlink,
  Run,
  ParagraphContent,
} from '../../../types/document';

function docFrom(content: ParagraphContent[]): Document {
  const paragraph: Paragraph = { type: 'paragraph', content };
  return { package: { document: { content: [paragraph] } } } as unknown as Document;
}

function rebuiltContent(content: ParagraphContent[]): ParagraphContent[] {
  const rebuilt = fromProseDoc(toProseDoc(docFrom(content)));
  return (rebuilt.package.document.content[0] as Paragraph).content;
}

const runText = (i: ParagraphContent, text: string): boolean =>
  i.type === 'run' && (i.content ?? []).some((c) => c.type === 'text' && c.text === text);

// A hyperlink whose two children have different formatting → two PM text nodes
// sharing one href → coalesced back into a single Hyperlink content item.
function multiNodeLink(): Hyperlink {
  return {
    type: 'hyperlink',
    href: 'http://example.com',
    children: [
      { type: 'run', content: [{ type: 'text', text: 'foo' }], formatting: { bold: true } } as Run,
      { type: 'run', content: [{ type: 'text', text: 'bar' }] } as Run,
    ],
  };
}

describe('comment range alignment across a coalesced hyperlink', () => {
  test('a comment right after a multi-node hyperlink wraps the correct run', () => {
    const items = rebuiltContent([
      multiNodeLink(),
      { type: 'commentRangeStart', id: 5 } as ParagraphContent,
      { type: 'run', content: [{ type: 'text', text: 'X' }] } as Run,
      { type: 'commentRangeEnd', id: 5 } as ParagraphContent,
    ]);

    const startIdx = items.findIndex((i) => i.type === 'commentRangeStart' && i.id === 5);
    const endIdx = items.findIndex((i) => i.type === 'commentRangeEnd' && i.id === 5);
    const xIdx = items.findIndex((i) => runText(i, 'X'));

    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(xIdx).toBeGreaterThanOrEqual(0);
    // The commented run must sit strictly INSIDE the range (start < X < end).
    // Before the fix the range collapsed to empty with X before both markers.
    expect(startIdx).toBeLessThan(xIdx);
    expect(endIdx).toBeGreaterThan(xIdx);
  });

  test('a comment covering the hyperlink itself keeps the link inside the range', () => {
    const items = rebuiltContent([
      { type: 'commentRangeStart', id: 7 } as ParagraphContent,
      multiNodeLink(),
      { type: 'commentRangeEnd', id: 7 } as ParagraphContent,
    ]);

    const startIdx = items.findIndex((i) => i.type === 'commentRangeStart' && i.id === 7);
    const endIdx = items.findIndex((i) => i.type === 'commentRangeEnd' && i.id === 7);
    const linkIdx = items.findIndex((i) => i.type === 'hyperlink');

    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(linkIdx).toBeGreaterThan(startIdx);
    expect(endIdx).toBeGreaterThan(linkIdx);
  });

  test('a plain comment (no hyperlink) still wraps its run', () => {
    const items = rebuiltContent([
      { type: 'run', content: [{ type: 'text', text: 'before' }] } as Run,
      { type: 'commentRangeStart', id: 9 } as ParagraphContent,
      { type: 'run', content: [{ type: 'text', text: 'inside' }] } as Run,
      { type: 'commentRangeEnd', id: 9 } as ParagraphContent,
    ]);

    const startIdx = items.findIndex((i) => i.type === 'commentRangeStart' && i.id === 9);
    const endIdx = items.findIndex((i) => i.type === 'commentRangeEnd' && i.id === 9);
    const insideIdx = items.findIndex((i) => runText(i, 'inside'));

    expect(startIdx).toBeLessThan(insideIdx);
    expect(endIdx).toBeGreaterThan(insideIdx);
  });
});
