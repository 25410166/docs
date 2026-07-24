/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, test } from 'bun:test';
import { adjustKinsokuBreak, isLineEndForbidden, isLineStartForbidden } from '../kinsoku';

describe('isLineStartForbidden / isLineEndForbidden', () => {
  test('closing punctuation cannot start a line', () => {
    expect(isLineStartForbidden('。')).toBe(true);
    expect(isLineStartForbidden('」')).toBe(true);
    expect(isLineStartForbidden('、')).toBe(true);
  });

  test('opening brackets cannot end a line', () => {
    expect(isLineEndForbidden('「')).toBe(true);
    expect(isLineEndForbidden('（')).toBe(true);
  });

  test('ordinary CJK characters are unrestricted', () => {
    expect(isLineStartForbidden('中')).toBe(false);
    expect(isLineEndForbidden('中')).toBe(false);
  });
});

describe('adjustKinsokuBreak', () => {
  test('pulls a forbidden line-start character back onto the current line', () => {
    const text = 'AB。CD';
    // Naive break lands right before '。' (index 2).
    const naive = 2;
    const adjusted = adjustKinsokuBreak(text, 0, naive);
    expect(text[adjusted]).not.toBe('。');
    expect(adjusted).toBe(naive + 1); // '。' pulled onto this line
  });

  test('pushes a forbidden line-end character onto the next line', () => {
    const text = '见附录（详情';
    // Naive break lands right after '（' (index 4, so chunk end = 4).
    const naive = 4;
    const adjusted = adjustKinsokuBreak(text, 0, naive);
    expect(text[adjusted - 1]).not.toBe('（');
    expect(adjusted).toBe(naive - 1); // '（' pushed to next line
  });

  test('no-op when the break already lands on an unrestricted character', () => {
    const text = '中文文本没有问题';
    const naive = 4;
    expect(adjustKinsokuBreak(text, 0, naive)).toBe(naive);
  });

  test('no-op at the true end of the text (nothing follows to protect)', () => {
    const text = '句子结束。';
    expect(adjustKinsokuBreak(text, 0, text.length)).toBe(text.length);
  });

  test('never shrinks the chunk to zero width', () => {
    // Every character after index 1 is a forbidden line-start character —
    // adjustment must stop before collapsing the chunk to nothing.
    const text = 'A。、；：！';
    const adjusted = adjustKinsokuBreak(text, 0, 3);
    expect(adjusted).toBeGreaterThan(0);
  });
});
