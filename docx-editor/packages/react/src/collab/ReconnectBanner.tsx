/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Default reconnecting/offline indicator for the SDK. A thin strip
// rendered above the editing surface whenever the Yjs provider isn't
// `connected`. The editor stays usable — edits buffer locally and
// flush on reconnect — but the user sees that their changes aren't
// being broadcast right now. Theme-token styled via --doc-* vars so
// it inherits the host's light/dark surface.
import type { CSSProperties } from 'react';
import type { CollabStatus } from './useCollab';

const base: CSSProperties = {
  flex: '0 0 auto',
  padding: '6px 16px',
  fontSize: 12,
  fontWeight: 500,
  textAlign: 'center',
  fontFamily:
    'var(--doc-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
};

const byStatus: Record<Exclude<CollabStatus, 'connected'>, CSSProperties> = {
  connecting: {
    background: 'var(--doc-warning-bg, #fffbeb)',
    color: 'var(--doc-warning-text, #92400e)',
    borderBottom: '1px solid var(--doc-warning-border, #fde68a)',
  },
  disconnected: {
    background: 'var(--doc-danger-bg, #fef2f2)',
    color: 'var(--doc-danger-text, #991b1b)',
    borderBottom: '1px solid var(--doc-danger-border, #fecaca)',
  },
};

const labels: Record<Exclude<CollabStatus, 'connected'>, string> = {
  connecting: 'Reconnecting to the session…',
  disconnected:
    "You're offline — edits are saved locally and will sync when the connection comes back.",
};

/**
 * Renders nothing when `status` is `connected`; otherwise a full-width
 * amber (connecting) or red (disconnected) strip with a short message.
 */
export function ReconnectBanner({ status }: { status: CollabStatus }) {
  if (status === 'connected') return null;
  return (
    <div role="status" aria-live="polite" style={{ ...base, ...byStatus[status] }}>
      {labels[status]}
    </div>
  );
}
