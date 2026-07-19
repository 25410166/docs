/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Trigger a browser file download for `blob` under `fileName`.
 *
 * The classic anchor-click dance (object URL → hidden `<a download>` → click →
 * deferred revoke) was duplicated four times across DocxEditor's save/export
 * handlers. Extracting it removes that duplication and pulls one small IO
 * primitive out of the god-component (docs/internal/40 — DocxEditor
 * decomposition). Pure with respect to React: no state, no closures.
 *
 * The revoke is deferred a tick because Safari cancels an in-flight download if
 * the object URL is revoked synchronously after `click()`.
 */
export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
