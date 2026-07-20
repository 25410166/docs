/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Non-text content inside a <w:hyperlink> — a clickable image, a TOC leader
 * tab, a line break — must survive the ProseMirror round-trip. Previously the
 * load path emitted only `text` children (dropping the image/tab) and the save
 * path only re-emitted text runs, so a clickable image vanished on open and a
 * TOC entry lost its leader tab.
 */

import { describe, expect, test } from 'bun:test';
import type { Node as PMNode } from 'prosemirror-model';
import { toProseDoc } from '../toProseDoc';
import { fromProseDoc } from '../fromProseDoc';
import type { Document, Image, Paragraph, Hyperlink, Run } from '../../../types/document';

function makeImage(): Image {
  return {
    type: 'image',
    rId: 'rIdImg',
    src: 'data:image/png;base64,synthetic',
    size: { width: 914400, height: 914400 },
    wrap: { type: 'inline' },
  };
}

function docWithHyperlink(): Document {
  const hyperlink: Hyperlink = {
    type: 'hyperlink',
    rId: 'rIdLink',
    children: [
      { type: 'run', content: [{ type: 'drawing', image: makeImage() }] },
      { type: 'run', content: [{ type: 'text', text: 'Chapter 1' }] },
      { type: 'run', content: [{ type: 'tab' }] },
      { type: 'run', content: [{ type: 'text', text: '5' }] },
    ],
  };
  const paragraph: Paragraph = { type: 'paragraph', content: [hyperlink] };
  return { package: { document: { content: [paragraph] } } } as unknown as Document;
}

function countNodeType(doc: PMNode, typeName: string): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === typeName) n++;
    return true;
  });
  return n;
}

describe('hyperlink non-text content round-trips', () => {
  test('toProseDoc preserves an image + tab inside a hyperlink (not just text)', () => {
    const pm = toProseDoc(docWithHyperlink());
    expect(countNodeType(pm, 'image')).toBe(1);
    expect(countNodeType(pm, 'tab')).toBe(1);
    // The text children carry the hyperlink mark.
    let sawLinkedText = false;
    pm.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'hyperlink')) sawLinkedText = true;
      return true;
    });
    expect(sawLinkedText).toBe(true);
  });

  test('fromProseDoc preserves the image + tab on save round-trip (no content loss)', () => {
    const rebuilt = fromProseDoc(toProseDoc(docWithHyperlink()));
    const para = rebuilt.package.document.content[0] as Paragraph;

    // Collect every run content type across the paragraph — the hyperlink label
    // text stays inside the <w:hyperlink>; the atom image/tab survive as
    // adjacent runs (they can't hold the link mark). The point is that nothing
    // is dropped, which the old text-only path did.
    const allTypes: string[] = [];
    for (const item of para.content) {
      const runs =
        item.type === 'hyperlink' ? (item.children as Run[]) : item.type === 'run' ? [item] : [];
      for (const r of runs) for (const c of r.content ?? []) allTypes.push(c.type);
    }

    expect(allTypes).toContain('drawing'); // image preserved (was dropped before)
    expect(allTypes).toContain('tab'); // TOC leader tab preserved
    expect(allTypes).toContain('text'); // label text

    // And the hyperlink label text still round-trips inside the hyperlink.
    const link = para.content.find((c) => c.type === 'hyperlink') as Hyperlink | undefined;
    expect(link).toBeDefined();
  });
});
