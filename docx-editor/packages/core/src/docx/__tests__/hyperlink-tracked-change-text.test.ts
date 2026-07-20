/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A hyperlink whose display runs are wrapped in a tracked change (<w:ins> /
 * <w:del>) used to render as an empty link — the hyperlink child loop only
 * handled <w:r>/<w:bookmark*> and let ins/del fall through. The underlying
 * runs are now flattened so the link text survives.
 */

import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseParagraph } from '../paragraphParser';
import type { Hyperlink, Run } from '../../types/document';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function linkFrom(xml: string): Hyperlink | undefined {
  const root = parseXmlDocument(xml) as XmlElement;
  const para = parseParagraph(root, null, null, null, null, null);
  return para.content.find((c) => c.type === 'hyperlink') as Hyperlink | undefined;
}

function linkText(link: Hyperlink | undefined): string {
  if (!link) return '';
  return (link.children as Run[])
    .filter((c) => c.type === 'run')
    .flatMap((r) => (r.content ?? []).map((c) => (c.type === 'text' ? c.text : '')))
    .join('');
}

describe('hyperlink display text inside a tracked change', () => {
  test('an inserted (<w:ins>) link keeps its text', () => {
    const link = linkFrom(`
      <w:p ${W}>
        <w:hyperlink r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <w:ins w:id="3" w:author="A" w:date="2026-01-01T00:00:00Z">
            <w:r><w:t>Inserted link</w:t></w:r>
          </w:ins>
        </w:hyperlink>
      </w:p>`);
    expect(link).toBeDefined();
    expect(linkText(link)).toContain('Inserted link');
  });

  test('a plain (<w:r>) link is unaffected', () => {
    const link = linkFrom(`
      <w:p ${W}>
        <w:hyperlink r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <w:r><w:t>Plain link</w:t></w:r>
        </w:hyperlink>
      </w:p>`);
    expect(linkText(link)).toContain('Plain link');
  });
});
