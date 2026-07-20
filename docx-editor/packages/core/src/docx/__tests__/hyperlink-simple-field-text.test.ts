/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A hyperlink whose display text is a simple field (<w:fldSimple>) — e.g. a
 * PAGEREF/REF cross-reference or a TOC entry — used to render as an empty link:
 * the hyperlink child loop only handled <w:r>/<w:bookmark*>/<w:ins>/<w:del> and
 * let fldSimple fall through, dropping the text on round-trip. The field's
 * display runs are now flattened so the link text survives.
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

describe('hyperlink display text from a simple field', () => {
  test('a hyperlink wrapping <w:fldSimple> keeps the field result text', () => {
    const link = linkFrom(`
      <w:p ${W}>
        <w:hyperlink w:anchor="_Ref123" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <w:fldSimple w:instr=" PAGEREF _Ref123 \\h ">
            <w:r><w:t>42</w:t></w:r>
          </w:fldSimple>
        </w:hyperlink>
      </w:p>`);
    expect(link).toBeDefined();
    expect(linkText(link)).toContain('42');
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
