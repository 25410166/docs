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

import type { Command, EditorState } from 'prosemirror-state';

import {
  disabledFeatureSet,
  isFeatureEnabled,
  isCommandVetoed,
  buildFeatureVetoBindings,
} from './features';
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

describe('disabled features veto their command (docs#289)', () => {
  it('vetoes by feature id and by command name; enabled commands pass', () => {
    const disabled = disabledFeatureSet({ bold: false, italic: true });
    // Feature id form (executeCommand('bold')).
    expect(isCommandVetoed(disabled, 'bold')).toBe(true);
    // Command-registry name form (executeCommand('toggleBold')).
    expect(isCommandVetoed(disabled, 'toggleBold')).toBe(true);
    // An enabled feature is untouched, by either name.
    expect(isCommandVetoed(disabled, 'italic')).toBe(false);
    expect(isCommandVetoed(disabled, 'toggleItalic')).toBe(false);
    // Unknown ids are never vetoed.
    expect(isCommandVetoed(disabled, 'someOtherCommand')).toBe(false);
  });

  it('an empty disabled set vetoes nothing', () => {
    expect(isCommandVetoed(new Set(), 'bold')).toBe(false);
    expect(isCommandVetoed(new Set(), 'toggleBold')).toBe(false);
  });

  it('the keymap binding no-ops (returns true, never dispatches) when disabled, else falls through', () => {
    const disabled = new Set<string>(['bold']);
    const bindings = buildFeatureVetoBindings(() => disabled);
    const veto = bindings['Mod-b'] as Command;
    expect(veto).toBeDefined();

    // Disabled → command consumes the key as a no-op: returns true, no dispatch.
    let dispatched = false;
    const dispatch = () => {
      dispatched = true;
    };
    expect(veto({} as EditorState, dispatch)).toBe(true);
    expect(dispatched).toBe(false);

    // Enabled (feature removed from the live set) → falls through: returns false
    // so the real formatting command downstream runs.
    disabled.delete('bold');
    expect(veto({} as EditorState, dispatch)).toBe(false);
    expect(dispatched).toBe(false);
  });

  it('binds a key for every feature that owns a keyboard shortcut', () => {
    const bindings = buildFeatureVetoBindings(() => new Set());
    expect(Object.keys(bindings).sort()).toEqual(['Mod-Shift-x', 'Mod-b', 'Mod-i', 'Mod-u'].sort());
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
