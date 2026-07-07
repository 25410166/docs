/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit tests for the SDK customization surface (docs#272 / docs#273):
 *  - `features` flag-map resolution + disabled-id set (feature hiding).
 *  - `editorExtensions` → merged ProseMirror plugin stack.
 * Both are framework-agnostic pure functions, so no editor render is needed.
 */
import { describe, expect, it } from 'bun:test';
import type { Plugin } from 'prosemirror-state';

import { disabledFeatureSet, isFeatureEnabled } from './features';
import { resolveEditorExtensionPlugins, type EditorExtension } from './editorExtensions';

// Lightweight stand-ins — resolveEditorExtensionPlugins only moves references.
const p = (id: string) => ({ id }) as unknown as Plugin;

describe('features flag-map (docs#272)', () => {
  it('an explicit false hides; true shows; omitted falls back', () => {
    const features = { toolbar: false, ruler: true };
    expect(isFeatureEnabled(features, 'toolbar', true)).toBe(false);
    expect(isFeatureEnabled(features, 'ruler', false)).toBe(true);
    // Omitted key → caller fallback (the deprecated show* prop / chrome default).
    expect(isFeatureEnabled(features, 'statusBar', true)).toBe(true);
    expect(isFeatureEnabled(features, 'statusBar', false)).toBe(false);
  });

  it('features win over the fallback for the same region', () => {
    // show* prop says visible, features says hidden → hidden.
    expect(isFeatureEnabled({ toolbar: false }, 'toolbar', true)).toBe(false);
  });

  it('defaults to enabled when no map is passed', () => {
    expect(isFeatureEnabled(undefined, 'bold')).toBe(true);
  });

  it('disabledFeatureSet collects only the explicitly-disabled ids', () => {
    const set = disabledFeatureSet({ bold: false, italic: true, underline: false });
    expect(set.has('bold')).toBe(true);
    expect(set.has('underline')).toBe(true);
    expect(set.has('italic')).toBe(false);
    expect(set.size).toBe(2);
  });

  it('an empty / missing map disables nothing', () => {
    expect(disabledFeatureSet(undefined).size).toBe(0);
    expect(disabledFeatureSet({}).size).toBe(0);
  });
});

describe('editorExtensions plugin merge (docs#273)', () => {
  const base = [p('base-a'), p('base-b')];

  it('returns a copy of the base when no extensions are given', () => {
    const out = resolveEditorExtensionPlugins(base, undefined);
    expect(out).toEqual(base);
    expect(out).not.toBe(base); // fresh array, base untouched
  });

  it("appends an extension's plugins after the base", () => {
    const ext: EditorExtension = { name: 'host', plugins: [p('host-1')] };
    const out = resolveEditorExtensionPlugins(base, [ext]);
    expect(out.map((x) => (x as unknown as { id: string }).id)).toEqual([
      'base-a',
      'base-b',
      'host-1',
    ]);
  });

  it('a factory receives the plugins assembled so far', () => {
    const ext: EditorExtension = {
      name: 'wrap',
      plugins: (ctx) => [...ctx.plugins.slice(0, 1), p('wrapped')],
    };
    const out = resolveEditorExtensionPlugins(base, [ext]);
    expect(out.map((x) => (x as unknown as { id: string }).id)).toEqual([
      'base-a',
      'base-b',
      'base-a',
      'wrapped',
    ]);
  });

  it('replace:true swaps the accumulated stack wholesale', () => {
    const ext: EditorExtension = { name: 'own', plugins: [p('only')], replace: true };
    const out = resolveEditorExtensionPlugins(base, [ext]);
    expect(out.map((x) => (x as unknown as { id: string }).id)).toEqual(['only']);
  });

  it('a later extension with the same name overrides the earlier one', () => {
    const first: EditorExtension = { name: 'dup', plugins: [p('first')] };
    const second: EditorExtension = { name: 'dup', plugins: [p('second')] };
    const out = resolveEditorExtensionPlugins(base, [first, second]);
    const ids = out.map((x) => (x as unknown as { id: string }).id);
    expect(ids).toContain('second');
    expect(ids).not.toContain('first');
  });
});
