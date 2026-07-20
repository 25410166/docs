/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * A linked (`<a:blip r:link>`) image — or one whose binary can't be resolved —
 * parses to an Image with an `rId` but no `src`. runParser keeps such drawings
 * (guard: `image.src || image.rId`) instead of dropping them, so the reference
 * survives round-trip and the painter can show a placeholder. This pins the
 * data that guard relies on.
 */

import { describe, test, expect } from 'bun:test';
import { parseDrawing } from '../imageParser';
import { parseXml } from '../xmlParser';
import type { XmlElement } from '../xmlParser';
import type { Image } from '../../types/document';

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

function parseDrawingFromXml(innerXml: string): Image | null {
  const doc = parseXml(`<w:drawing ${NS}>${innerXml}</w:drawing>`);
  const drawing = (doc.elements as XmlElement[])[0];
  return parseDrawing(drawing, undefined, undefined);
}

function linkedImageXml(blip: string): string {
  return `
    <wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="914400" cy="914400"/>
      <wp:docPr id="1" name="Linked Picture"/>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr><pic:cNvPr id="1" name="img"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill>${blip}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>
            <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>`;
}

describe('linked / unresolved image parsing', () => {
  test('an r:link blip yields rId but no src (kept by the runParser guard)', () => {
    const img = parseDrawingFromXml(linkedImageXml('<a:blip r:link="rId7"/>'));
    expect(img).not.toBeNull();
    expect(img!.rId).toBe('rId7');
    expect(img!.src).toBeUndefined();
  });

  test('an r:embed blip with no resolvable media also yields rId, no src', () => {
    const img = parseDrawingFromXml(linkedImageXml('<a:blip r:embed="rId9"/>'));
    expect(img).not.toBeNull();
    expect(img!.rId).toBe('rId9');
    expect(img!.src).toBeUndefined();
  });
});
