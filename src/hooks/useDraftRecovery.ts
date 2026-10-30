import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "../types";
import { detectContext, service } from "../services/sharepointService";
import {
  DraftRecoveryStore,
  RecoverySession,
  recoveryErrorMessage,
  recoveryFingerprint,
  type RecoveredDraft,
  type RecoverySnapshot,
  type RecoverySummary,
} from "../services/draftRecovery";

interface Options {
  initialPage: Partial<Page>;
  snapshot: RecoverySnapshot;
  dirty: boolean;
  busy: boolean;
  suspended?: boolean;
}
type Status = "loading" | "ready" | "saving" | "saved" | "unavailable";

/** Local recovery never invokes a SharePoint write or implicitly restores a copy. */
export function useDraftRecovery(options: Options) {
  const [status, setStatus] = useState<Status>("loading");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RecoverySummary[]>([]);
  const [epoch, setEpoch] = useState(0);
  const initialPage = useRef(options.initialPage).current;
  const store = useRef(new DraftRecoveryStore()).current;
  const session = useRef<RecoverySession | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(false);
  const cleared = useRef(false);
  const unavailable = useRef(false);
  const restoring = useRef(false);
  const preparingSave = useRef(false);
  const wasBusy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const savedFingerprint = useRef<string | null>(null);
  const fingerprint = recoveryFingerprint(options.snapshot);

  const cancelTimer = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const reportError = useCallback((cause: unknown) => {
    unavailable.current = true;
    if (mounted.current) {
      setError(recoveryErrorMessage(cause));
      setStatus("unavailable");
    }
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    cancelTimer();
    const active = session.current;
    const state = latest.current;
    if (
      !active ||
      cleared.current ||
      unavailable.current ||
      restoring.current ||
      preparingSave.current ||
      state.busy ||
      state.suspended ||
      !state.dirty
    )
      return;
    const nextFingerprint = recoveryFingerprint(state.snapshot);
    if (savedFingerprint.current === nextFingerprint) return;
    if (mounted.current) setStatus("saving");
    try {
      const timestamp = await active.write(state.snapshot);
      if (timestamp && !cleared.current) {
        savedFingerprint.current = nextFingerprint;
        if (mounted.current) {
          setSavedAt(timestamp);
          setStatus(
            recoveryFingerprint(latest.current.snapshot) === nextFingerprint
              ? "saved"
              : "saving",
          );
        }
      }
    } catch (cause) {
      reportError(cause);
    }
  }, [cancelTimer, reportError]);

  const prepareSave = useCallback(async (): Promise<void> => {
    cancelTimer();
    preparingSave.current = true;
    const active = session.current;
    if (!active || cleared.current || unavailable.current) return;
    const checkpoint = { ...latest.current.snapshot, retryBlocked: true };
    try {
      const timestamp = await active.prepareSave(checkpoint);
      if (timestamp && !cleared.current) {
        savedFingerprint.current = recoveryFingerprint(checkpoint);
        if (mounted.current) {
          setSavedAt(timestamp);
          setStatus("saved");
        }
      }
    } catch (cause) {
      reportError(cause);
    }
  }, [cancelTimer, reportError]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const context = detectContext(window);
        const identity = await service.currentUserIdentity();
        if (cancelled || cleared.current) return;
        const scope = {
          mode: context.mode,
          webUrl:
            context.mode === "sharepoint"
              ? context.webUrl
              : window.location.origin,
          userId: identity.Id,
        };
        const origin = {
          pageId: initialPage.Id,
          spaceId: initialPage.SpaceId,
          parentPageId: initialPage.ParentPageId ?? null,
        };
        const active = new RecoverySession(store, scope, origin);
        const copies = await store.list(scope, origin, active.id);
        if (cancelled || cleared.current) return;
        session.current = active;
        setCandidates(copies);
        setStatus("ready");
        setEpoch((value) => value + 1);
      } catch (cause) {
        if (!cancelled) reportError(cause);
      }
    })();
    return () => {
      cancelled = true;
      // Best effort on navigation. A completed copy is NEVER removed on unmount.
      void flush();
      mounted.current = false;
    };
  }, [flush, initialPage, reportError, store]);

  useEffect(() => {
    if (wasBusy.current && !options.busy) preparingSave.current = false;
    wasBusy.current = options.busy;
    cancelTimer();
    if (
      !options.dirty ||
      options.busy ||
      options.suspended ||
      !session.current ||
      cleared.current ||
      unavailable.current ||
      restoring.current ||
      preparingSave.current
    )
      return;
    if (fingerprint === savedFingerprint.current) return;
    setStatus("saving");
    timer.current = setTimeout(() => {
      void flush();
    }, 650);
    return cancelTimer;
  }, [
    fingerprint,
    options.dirty,
    options.busy,
    options.suspended,
    epoch,
    flush,
    cancelTimer,
  ]);

  useEffect(() => {
    const onPageHide = () => {
      void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flush]);

  const clear = useCallback(async (): Promise<void> => {
    // Set this before awaiting: an in-flight save and an unmount cannot recreate it.
    cleared.current = true;
    cancelTimer();
    try {
      await session.current?.clear();
    } catch (cause) {
      reportError(cause);
      throw cause;
    }
  }, [cancelTimer, reportError]);

  const discardCandidate = useCallback(
    async (id: string): Promise<void> => {
      const active = session.current;
      if (!active) return;
      try {
        await store.remove(active.scope, id);
        if (mounted.current)
          setCandidates((copies) => copies.filter((copy) => copy.id !== id));
      } catch (cause) {
        reportError(cause);
      }
    },
    [reportError, store],
  );

  const restore = useCallback(
    async (
      id: string,
      apply: (draft: RecoveredDraft) => void,
    ): Promise<boolean> => {
      const active = session.current;
      if (
        !active ||
        cleared.current ||
        unavailable.current ||
        restoring.current
      )
        return false;
      restoring.current = true;
      cancelTimer();
      let restored: RecoveredDraft | undefined;
      let applied = false;
      try {
        restored = await store.restore(active.scope, id, initialPage);
        if (cleared.current) return false;
        // Save a separate session copy first. Another tab keeps its own draft ID.
        const timestamp = await active.write(restored);
        if (!timestamp || cleared.current) return false;
        apply(restored);
        applied = true;
        savedFingerprint.current = recoveryFingerprint(restored);
        if (mounted.current) {
          setSavedAt(timestamp);
          setStatus("saved");
        }
        const removed = await store.removeIfUnchanged(
          active.scope,
          id,
          restored.sourceRevision,
        );
        if (mounted.current) {
          if (removed)
            setCandidates((copies) => copies.filter((copy) => copy.id !== id));
          else
            setCandidates(
              await store.list(active.scope, active.origin, active.id),
            );
        }
        return true;
      } catch (cause) {
        reportError(cause);
        return applied;
      } finally {
        if (restored && !applied)
          restored.pendingImages.forEach((image) =>
            URL.revokeObjectURL(image.previewUrl),
          );
        restoring.current = false;
        // Run the next snapshot only after the caller's batched state changes commit.
        if (mounted.current) setEpoch((value) => value + 1);
      }
    },
    [cancelTimer, initialPage, reportError, store],
  );

  return {
    status,
    savedAt,
    error,
    candidates,
    restore,
    discardCandidate,
    clear,
    flush,
    prepareSave,
  };
}
