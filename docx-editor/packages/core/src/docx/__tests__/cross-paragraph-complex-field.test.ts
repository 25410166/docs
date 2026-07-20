/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A complex field (TOC / INCLUDETEXT / index) whose begin…end straddles
 * paragraph boundaries never closed inside its begin-paragraph, so every run
 * gathered after the `begin` — the instruction and the visible result in that
 * paragraph — was silently dropped and the field structure destroyed. The
 * field is now closed at the paragraph boundary so its content survives.
 */

import { describe, expect, test } from 'bun:test';
import type { XmlElement } from '../xmlParser';
import { parseXmlDocument } from '../xmlParser';
import { parseParagraph } from '../paragraphParser';
import type { ComplexField } from '../../types/document';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function parseP(xml: string) {
  const root = parseXmlDocument(xml) as XmlElement;
  return parseParagraph(root, null, null, null, null, null);
}

describe('cross-paragraph complex field', () => {
  test('the begin-paragraph of a TOC field keeps its instruction and result', () => {
    // begin + instrText + separate + result, but NO end (it lands later).
    const para = parseP(`
      <w:p ${W}>
        <w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" </w:instrText></w:r>
        <w:r><w:fldChar w:fldCharType="separate"/></w:r>
        <w:r><w:t>Chapter 1</w:t></w:r>
      </w:p>`);

    const field = para.content.find((c) => c.type === 'complexField') as ComplexField | undefined;
    expect(field).toBeDefined();
    expect(field!.instruction).toContain('TOC');
    // The visible result text must survive (was dropped entirely before).
    expect(JSON.stringify(field!.fieldResult)).toContain('Chapter 1');
  });

  test('a normally-closed field in one paragraph still works (control)', () => {
    const para = parseP(`
      <w:p ${W}>
        <w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
        <w:r><w:fldChar w:fldCharType="separate"/></w:r>
        <w:r><w:t>1</w:t></w:r>
        <w:r><w:fldChar w:fldCharType="end"/></w:r>
      </w:p>`);

    const fields = para.content.filter((c) => c.type === 'complexField');
    expect(fields.length).toBe(1);
    expect((fields[0] as ComplexField).instruction).toContain('PAGE');
  });

  test('a paragraph with no field is unaffected', () => {
    const para = parseP(`<w:p ${W}><w:r><w:t>plain</w:t></w:r></w:p>`);
    expect(para.content.some((c) => c.type === 'complexField')).toBe(false);
  });
});
