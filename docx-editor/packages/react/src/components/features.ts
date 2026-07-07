/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Feature-flag map for DocxEditor chrome (docs#272, doc 38 §5a).
 *
 * A flat `Record<string, boolean>` of control-id → enabled. `false` hides the
 * control; an omitted key defaults to enabled. This is the shared shape the
 * sister sheet SDK already uses (`CasualSheets.features`); the *keys* are
 * per-format (a doc's `ruler` control and a sheet's `merge` control are
 * legitimately different), so docs publishes its own catalog below.
 *
 * The coarse `show*` booleans (`showToolbar`, `showStatusBar`, …) stay as
 * deprecated shortcuts that write into this map — when both are supplied for
 * the same region, `features` wins.
 */

import { createContext } from 'react';

/**
 * The published DocxEditor feature-id catalog. Split into coarse chrome regions
 * (each mirrors a deprecated `show*` boolean) and individual toolbar controls.
 * Hosts may pass ids outside this list; they are simply ignored, so the catalog
 * can grow without a breaking change.
 */
export const DOCX_FEATURE_IDS = [
  // ── Coarse chrome regions (deprecated show* booleans map to these) ──
  'toolbar',
  'panelRail',
  'statusBar',
  'zoomControl',
  'printButton',
  'outline',
  'ruler',
  // ── Individual toolbar controls (hidden via DisabledFeaturesContext) ──
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'paintFormat',
] as const;

/** A known DocxEditor feature id. Hosts may also pass arbitrary string keys. */
export type DocxFeatureId = (typeof DOCX_FEATURE_IDS)[number];

/** Per-control on/off map. Omitted keys default to enabled. */
export type FeatureMap = Record<string, boolean>;

/**
 * Resolve a feature's effective enabled state. An explicit `features[id]` wins;
 * otherwise the caller's `fallback` (e.g. the deprecated `show*` prop, or the
 * `chrome`-preset default) applies. Defaults to enabled when nothing is set.
 */
export function isFeatureEnabled(
  features: FeatureMap | undefined,
  id: string,
  fallback = true
): boolean {
  if (features && Object.prototype.hasOwnProperty.call(features, id)) {
    return features[id];
  }
  return fallback;
}

/** The set of feature ids explicitly disabled (`features[id] === false`). */
export function disabledFeatureSet(features: FeatureMap | undefined): ReadonlySet<string> {
  if (!features) return EMPTY_DISABLED_FEATURES;
  const set = new Set<string>();
  for (const [id, enabled] of Object.entries(features)) {
    if (enabled === false) set.add(id);
  }
  return set;
}

/** Shared empty set so consumers avoid churn when no features are disabled. */
export const EMPTY_DISABLED_FEATURES: ReadonlySet<string> = new Set<string>();

/**
 * Context carrying the set of explicitly-disabled feature ids down to the
 * toolbar. A `ToolbarButton` with a matching `featureId` renders `null`, so a
 * host hides an individual control by id without the toolbar knowing which
 * buttons exist. Default is the empty set (everything enabled).
 */
export const DisabledFeaturesContext = createContext<ReadonlySet<string>>(EMPTY_DISABLED_FEATURES);
