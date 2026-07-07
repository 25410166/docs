/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * CasualEditor — the composable SDK wrapper around DocxEditor.
 *
 * Bundles the four pieces a host app needs to embed the editor with
 * minimum ceremony:
 *
 *   1. DocxEditor (the editing surface)
 *   2. FileSource (bytes I/O — host's API or any FileSource impl)
 *   3. Optional collab (Yjs over WS) — opts in by passing backendUrl
 *   4. Optional autosave — opts in by passing autosave={true}
 *
 * Design intent — exposing the SDK shape for Drive integration:
 *
 *   <CasualEditor
 *     fileSource={driveFs}
 *     docId={fileId}
 *     backendUrl={enableCollab ? 'wss://...' : undefined}
 *     autosave
 *     user={{ name, color }}
 *   />
 *
 * Standalone mode (no `backendUrl`): the editor runs entirely
 * client-side, reading bytes from `fileSource.open(docId)`,
 * saving back via `fileSource.save(docId, bytes)`. No WS server,
 * no Yjs runtime — Drive deploys as one container.
 *
 * Collab mode (`backendUrl` set): Yjs sync over WS via the
 * library's `useCollab` hook. Initial load + final snapshot still
 * flow through FileSource; the WS only carries Y updates between
 * connected clients. Drive operator runs the Casual gateway as a
 * second container.
 *
 * Advanced consumers can still import the raw `DocxEditor` +
 * compose their own — this wrapper is a sensible-defaults
 * convenience, not a constraint.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { DocxEditor, type DocxEditorProps, type DocxEditorRef } from './DocxEditor';
import { PresenceCluster } from './PresenceCluster';
import { ShareDialog } from './ShareDialog';
import { createDocOpsTransport } from '../docops';
import { createEmptyDocument } from '@eigenpal/docx-core/utils';
import type { Document } from '@eigenpal/docx-core/types/document';
import type { Comment } from '@eigenpal/docx-core/types/content';

import {
  useCollab,
  makeFootnoteSync,
  makePropsSync,
  type CollabPeer,
  type CollabState,
  type CollabStatus,
} from '../collab/useCollab';
import { commentsFromMap, observeComments, writeCommentsToMap } from '../collab/commentSync';
import { ReconnectBanner } from '../collab/ReconnectBanner';
import {
  useFileSourceAutoSave,
  type UseFileSourceAutoSaveReturn,
} from '../file-source/useFileSourceAutoSave';
import type { FileSource } from '../file-source/types';
import { SigningProvider, SigningPane } from '../signing';
import type { SigningSessionConfig } from '../signing';

export interface CasualEditorProps {
  /**
   * Storage adapter — supplies bytes for `docId` via `open()` and
   * writes back via `save()`. Drive ships its own `DriveFileSource`;
   * casual-docs standalone uses `PersonalFileSource`; demos use
   * `BrowserFileSource`. The wrapper doesn't care which.
   */
  fileSource: FileSource;
  /** ID of the document to load. The wrapper calls `fileSource.open(docId)` on mount. */
  docId: string;
  /**
   * WS base URL (ws:// or wss://) of a Casual gateway. When set,
   * the wrapper enables Yjs collab — the editor renders with
   * `externalPlugins` from `useCollab` and `externalContent` true.
   * When omitted, the editor runs standalone (no collab plugins).
   */
  backendUrl?: string;
  /**
   * Local user identity for collab awareness. Required when
   * `backendUrl` is set; ignored otherwise. Drive supplies the
   * signed-in user's display name + a per-user color.
   */
  user?: { name: string; color: string };
  /**
   * Enable client-side auto-save through `fileSource.save(...)` on
   * a tick. Default false. When enabled, the wrapper renders an
   * `AutosaveStatus`-compatible state via `onAutosaveState`; hosts
   * that want their own indicator subscribe to that and skip the
   * built-in component.
   */
  autosave?: boolean;
  /** Tick interval for autosave in ms. Default 30s. */
  autosaveInterval?: number;
  /** Author used by comments + track-change attribution. */
  author?: string;
  /**
   * Document mode (SuperDoc vocabulary): `'editing'`, `'suggesting'`, or
   * `'viewing'`. Forwarded to DocxEditor.documentMode.
   */
  documentMode?: DocxEditorProps['documentMode'];
  /** Fires when the document mode changes (forwarded from DocxEditor). */
  onModeChange?: DocxEditorProps['onModeChange'];
  /** Forwarded to DocxEditor.onSave for hosts that want a hook. */
  onSave?: DocxEditorProps['onSave'];
  /** Forwarded to DocxEditor.onSelectionChange — Drive uses this for the right-panel sync. */
  onSelectionChange?: DocxEditorProps['onSelectionChange'];
  /** Forwarded to DocxEditor.onError. */
  onError?: DocxEditorProps['onError'];
  /**
   * Built-in DocOps AI assistant. Forwarded to DocxEditor.ai — set
   * `ai={{ enabled: true }}` to unlock the assistant panel (no window
   * global). See DocxEditor's `ai` prop.
   */
  ai?: DocxEditorProps['ai'];
  /**
   * Fires whenever a tick lands — host can render its own
   * "Saved 2 min ago" indicator without subscribing to the
   * underlying hook.
   */
  onAutosaveState?: (state: UseFileSourceAutoSaveReturn) => void;
  /**
   * Fires when collab state changes (peer joins / leaves /
   * disconnects). Drive uses this to render the presence avatars.
   */
  onCollabState?: (state: CollabState) => void;
  /**
   * Share action for the collab presence cluster. When collab is
   * active the title-bar PresenceCluster always shows a Share button;
   * passing `onShare` overrides its default behaviour (which opens the
   * wrapper's built-in ShareDialog — a room link + view/comment/edit
   * role picker) with the host's own flow.
   */
  onShare?: () => void;
  /** Custom render override for the loading state. Default is a centered "Loading…" string. */
  renderLoading?: () => ReactNode;
  /** Custom render override for the error state. */
  renderError?: (err: Error) => ReactNode;
  /**
   * Active signing session — when set, the wrapper renders a
   * SigningProvider + SigningPane next to the editor and walks the
   * signer through the configured fields. Set null to disable
   * signing mode.
   *
   * Drive supplies this when the user clicks "Sign this document";
   * the wrapper fires the host's onFieldSigned / onComplete /
   * onCancel callbacks as the signer progresses.
   */
  signing?: SigningSessionConfig | null;
  /**
   * Forwarded escape hatch for any DocxEditor prop the wrapper
   * doesn't surface explicitly. Use sparingly — anything that
   * belongs on the SDK surface should get a real prop.
   */
  docxEditorProps?: Partial<DocxEditorProps>;
}

/**
 * Ref forwarded by CasualEditor. Mostly the underlying
 * DocxEditorRef, plus a couple of SDK-level helpers (force-save,
 * collab presence).
 */
export interface CasualEditorRef extends DocxEditorRef {
  /** Forces a save round-trip through the autosave hook. No-op when autosave is disabled. */
  flushSave: () => Promise<void>;
  /** Current collab presence — empty when collab is off. */
  collabPeers: () => CollabPeer[];
  /** Connection status — `'standalone'` when collab is off. */
  collabStatus: () => CollabStatus | 'standalone';
}

export const CasualEditor = forwardRef<CasualEditorRef, CasualEditorProps>(
  function CasualEditor(props, ref) {
    const {
      fileSource,
      docId,
      backendUrl,
      user,
      autosave = false,
      autosaveInterval = 30000,
      author,
      documentMode,
      onModeChange,
      onSave,
      onSelectionChange,
      onError,
      ai,
      onAutosaveState,
      onCollabState,
      onShare,
      renderLoading,
      renderError,
      signing,
      docxEditorProps,
    } = props;

    const editorRef = useRef<DocxEditorRef>(null);

    // ---------------------------------------------------------------
    // Document loading via FileSource
    // ---------------------------------------------------------------

    const [loadState, setLoadState] = useState<
      | { kind: 'loading' }
      | { kind: 'ready'; buffer: ArrayBuffer; fileName: string }
      | { kind: 'error'; err: Error }
    >({ kind: 'loading' });

    useEffect(() => {
      let cancelled = false;
      setLoadState({ kind: 'loading' });
      (async () => {
        try {
          const result = await fileSource.open(docId);
          if (cancelled) return;
          setLoadState({ kind: 'ready', buffer: result.bytes, fileName: result.name });
        } catch (err) {
          if (cancelled) return;
          setLoadState({ kind: 'error', err: err instanceof Error ? err : new Error(String(err)) });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [fileSource, docId]);

    // ---------------------------------------------------------------
    // Collab — opt-in via backendUrl
    // ---------------------------------------------------------------

    // The hook MUST be called unconditionally to obey rules-of-hooks;
    // we pass sentinel values when collab is off and ignore the
    // returned plugins. The destructured plugins are an empty array
    // in standalone mode because we never wire them to DocxEditor.
    const collabState = useCollabSafe({
      enabled: !!backendUrl,
      backend: backendUrl ?? '',
      room: docId,
      user: user ?? { name: 'Anonymous', color: '#94a3b8' },
    });

    useEffect(() => {
      if (collabState && onCollabState) onCollabState(collabState);
    }, [collabState, onCollabState]);

    // Adapter so footnote edits ride the shared `footnotes` Y.Map (footnotes
    // aren't in the PM tree, so they don't travel over ySyncPlugin). Memoised on
    // collabState so the editor's observer subscribes once per session.
    const footnoteSync = useMemo(
      () => (collabState ? makeFootnoteSync(collabState.footnotesMap) : undefined),
      [collabState]
    );
    const endnoteSync = useMemo(
      () => (collabState ? makeFootnoteSync(collabState.endnotesMap) : undefined),
      [collabState]
    );
    const propsSync = useMemo(
      () => (collabState ? makePropsSync(collabState.propsMap) : undefined),
      [collabState]
    );

    // Comment threads ride a shared `comments` Y.Map (highlight marks sync via
    // ySyncPlugin, but the thread content doesn't). In collab we drive
    // DocxEditor's CONTROLLED comments from the map: observe → setState; the
    // editor's onCommentsChange reconciles back into the map (the observer is
    // the single source of truth, so local writes round-trip through it too).
    const [collabComments, setCollabComments] = useState<Comment[]>([]);
    useEffect(() => {
      if (!collabState) return;
      const map = collabState.commentsMap;
      setCollabComments(commentsFromMap(map));
      return observeComments(map, setCollabComments);
    }, [collabState]);
    const handleCommentsChange = useCallback(
      (next: Comment[]) => {
        if (collabState) writeCommentsToMap(collabState.commentsMap, next);
      },
      [collabState]
    );

    // Built-in share surface. When collab is active the title-bar Share
    // button opens the wrapper's own ShareDialog (a room link + role picker);
    // a host that passes `onShare` overrides that with its own flow. Gated on
    // collab so standalone docs never show a Share affordance.
    const [shareOpen, setShareOpen] = useState(false);
    const handleShare = onShare ?? (() => setShareOpen(true));

    // Live presence in the title bar — avatar stack + room-status badge
    // (+ Share). Only mounted when collab is active, so standalone docs keep
    // the plain title bar. Fed by the same peers + status the ref exposes via
    // collabPeers()/collabStatus().
    const renderCollabPresence = collabState
      ? () => (
          <PresenceCluster
            peers={collabState.peers.map((p) => ({
              name: p.name,
              color: p.color,
              active: true,
            }))}
            status={collabState.status}
            onShare={handleShare}
          />
        )
      : undefined;

    // ---------------------------------------------------------------
    // Autosave — opt-in via autosave={true}
    // ---------------------------------------------------------------

    const autosaveState = useFileSourceAutoSave({
      fileSource,
      docId,
      editorRef,
      interval: autosaveInterval,
      enabled: autosave,
    });

    useEffect(() => {
      if (autosave && onAutosaveState) onAutosaveState(autosaveState);
    }, [autosave, autosaveState, onAutosaveState]);

    // ---------------------------------------------------------------
    // Ref forwarding
    // ---------------------------------------------------------------

    useImperativeHandle(ref, (): CasualEditorRef => {
      const inner = editorRef.current;
      // Defensive: when the editor hasn't mounted yet, return a
      // surface that mostly no-ops so consumers don't have to
      // null-check every method.
      const safe: DocxEditorRef = inner ?? noopDocxEditorRef();
      return {
        ...safe,
        flushSave: () => (autosave ? autosaveState.flush() : Promise.resolve()),
        collabPeers: () => (collabState ? collabState.peers : []),
        collabStatus: () => (collabState ? collabState.status : 'standalone'),
      };
    }, [collabState, autosaveState, autosave]);

    // ---------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------

    if (loadState.kind === 'loading') {
      return <>{renderLoading ? renderLoading() : <DefaultLoading />}</>;
    }
    if (loadState.kind === 'error') {
      return <>{renderError ? renderError(loadState.err) : <DefaultError err={loadState.err} />}</>;
    }

    const editor = (
      <DocxEditor
        ref={editorRef}
        documentBuffer={loadState.buffer}
        document={collabState ? blankDoc() : undefined}
        externalContent={!!collabState}
        externalPlugins={collabState ? collabState.plugins : undefined}
        footnoteSync={footnoteSync}
        endnoteSync={endnoteSync}
        propsSync={propsSync}
        comments={collabState ? collabComments : undefined}
        onCommentsChange={collabState ? handleCommentsChange : undefined}
        author={author}
        documentMode={documentMode}
        onModeChange={onModeChange}
        onSave={onSave}
        onSelectionChange={onSelectionChange}
        onError={onError}
        renderTitleBarRight={renderCollabPresence}
        docopsTransport={createDocOpsTransport({ collabWsUrl: backendUrl, room: docId })}
        ai={ai}
        {...docxEditorProps}
      />
    );

    // Without an active signing session, the content is the editor
    // alone; otherwise wrap it in a SigningProvider and render the
    // SigningPane alongside. The provider captures the current
    // document bytes so the eventual `onComplete` payload carries the
    // right base buffer.
    const content = !signing ? (
      editor
    ) : (
      <SigningProvider session={signing} documentBytes={loadState.buffer}>
        {editor}
        <SigningPane banner={signing.banner} />
      </SigningProvider>
    );

    // Built-in share dialog — rendered only for the wrapper's own Share
    // flow (collab active, host didn't supply its own `onShare`). Fixed-
    // positioned, so it never disturbs the editor layout when closed.
    const shareDialog =
      collabState && !onShare ? (
        <ShareDialog isOpen={shareOpen} onClose={() => setShareOpen(false)} roomId={docId} />
      ) : null;

    // In collab mode, show the default reconnecting/offline banner
    // above the editor whenever the session isn't connected. Hosts
    // that render their own indicator can ignore it — the strip only
    // appears while degraded. Standalone/connected renders unchanged
    // so existing (non-collab) host layouts keep the editor as root.
    if (collabState && collabState.status !== 'connected') {
      return (
        <div style={bannerLayoutStyle}>
          <ReconnectBanner status={collabState.status} />
          <div style={bannerBodyStyle}>{content}</div>
          {shareDialog}
        </div>
      );
    }

    return (
      <>
        {content}
        {shareDialog}
      </>
    );
  }
);

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * useCollabSafe wraps useCollab so the hook only runs when collab
 * is enabled. We can't call hooks conditionally, so we return a
 * stable null and let the underlying hook short-circuit via a
 * sentinel `__collabDisabled` value passed when `enabled=false`.
 *
 * Implementation: when disabled, we DON'T call useCollab at all
 * (it'd open a WS) — we render the wrapper without collab. To
 * keep rules-of-hooks happy across mode changes the host MUST
 * keep `backendUrl` stable across the component's lifetime: either
 * provide it or don't, but don't flip mid-session. (We can't
 * enforce that at the type level; a host that swaps modes should
 * unmount + remount the wrapper.)
 */
function useCollabSafe(args: {
  enabled: boolean;
  backend: string;
  room: string;
  user: { name: string; color: string };
}): CollabState | null {
  if (!args.enabled) {
    // Hook order is fixed for the lifetime of the component — if
    // the caller flips backendUrl, React will throw a clearer error
    // than we could. This branch deliberately doesn't call useCollab.
    return null;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCollab({ backend: args.backend, room: args.room, user: args.user });
}

// Flex-column wrapper used only when the reconnect banner is visible,
// so the strip sits above a full-height editor body. Applied lazily
// (collab + degraded) to avoid changing the DOM for the common case.
const bannerLayoutStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
};

const bannerBodyStyle: CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};

function blankDoc(): Document {
  return createEmptyDocument();
}

function DefaultLoading() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        color: 'var(--doc-text-muted, #64748b)',
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
}

function DefaultError({ err }: { err: Error }) {
  return (
    <div
      style={{
        padding: '32px 24px',
        color: 'rgb(153, 27, 27)',
        fontSize: 14,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Couldn’t load the document</div>
      <div style={{ color: 'var(--doc-text-muted, #64748b)' }}>{err.message}</div>
    </div>
  );
}

/**
 * Sentinel ref returned by useImperativeHandle before the
 * underlying DocxEditor has mounted. Each method is a no-op or
 * trivial default so a consumer that grabs `casualRef.current`
 * before first render doesn't crash.
 */
function noopDocxEditorRef(): DocxEditorRef {
  const noop = () => {
    /* unmounted */
  };
  const noopAsync = () => Promise.resolve(null as ArrayBuffer | null);
  return {
    getAgent: () => null,
    getDocument: () => null,
    getEditorRef: () => null,
    save: noopAsync,
    setZoom: noop,
    getZoom: () => 100,
    focus: noop,
    getCurrentPage: () => 1,
    getTotalPages: () => 1,
    scrollToPage: noop,
    scrollToParaId: () => false,
    scrollToPosition: noop,
    openPrintPreview: noop,
    print: noop,
    loadDocument: noop,
    loadDocumentBuffer: () => Promise.resolve(),
    addComment: () => null,
    replyToComment: () => null,
    resolveComment: noop,
    proposeChange: () => false,
    findInDocument: () => [],
    applyFormatting: () => false,
    setParagraphStyle: () => false,
    getPageContent: () => null,
    insertReportFromData: () => false,
    createDocument: () => false,
  } as unknown as DocxEditorRef;
}
