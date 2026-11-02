import { useCallback, useEffect, useRef, useState } from "react";
import { detectContext, service } from "../services/sharepointService";
import {
  SavedPagesStore,
  savedPagesErrorMessage,
  savedPagesKey,
} from "../services/savedPages";

type SavedPagesState = {
  savedIds: Set<number>;
  available: boolean;
  loading: boolean;
  error: string | null;
  userId: number | null;
};

async function currentScope() {
  const context = detectContext(window);
  const identity = await service.currentUserIdentity();
  const scope = {
    mode: context.mode,
    webUrl:
      context.mode === "sharepoint" ? context.webUrl : window.location.origin,
    userId: identity.Id,
  };
  savedPagesKey(scope); // Validate the identity before exposing account-scoped state.
  return scope;
}

/** Personal shortcuts stay in this browser; no SharePoint content is written. */
export function useSavedPages() {
  const [state, setState] = useState<SavedPagesState>({
    savedIds: new Set(),
    available: false,
    loading: true,
    error: null,
    userId: null,
  });
  const mounted = useRef(false);
  const session = useRef<{ store: SavedPagesStore; storage: Storage } | null>(
    null,
  );
  const pending = useRef<{ id: number; promise: Promise<boolean> } | null>(
    null,
  );

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void (async () => {
      let userId: number | null = null;
      try {
        const scope = await currentScope();
        if (cancelled) return;
        userId = scope.userId;
        const storage = window.localStorage;
        const store = new SavedPagesStore(scope, storage);
        const savedIds = store.read();
        if (cancelled) return;
        session.current = { store, storage };
        setState({
          savedIds,
          available: true,
          loading: false,
          error: null,
          userId,
        });
      } catch (cause) {
        if (!cancelled) {
          session.current = null;
          setState({
            savedIds: new Set(),
            available: false,
            loading: false,
            error: savedPagesErrorMessage(cause),
            userId,
          });
        }
      }
    })();
    const refreshFromStorage = (event: StorageEvent) => {
      const active = session.current;
      if (
        !active ||
        event.storageArea !== active.storage ||
        (event.key !== null && event.key !== active.store.key)
      )
        return;
      try {
        const savedIds = active.store.read();
        setState((previous) => ({
          ...previous,
          savedIds,
          available: true,
          error: null,
        }));
      } catch (cause) {
        setState((previous) => ({
          ...previous,
          savedIds: new Set(),
          available: false,
          error: savedPagesErrorMessage(cause),
        }));
      }
    };
    window.addEventListener("storage", refreshFromStorage);
    return () => {
      cancelled = true;
      mounted.current = false;
      session.current = null;
      window.removeEventListener("storage", refreshFromStorage);
    };
  }, []);

  const toggle = useCallback((pageId: number): Promise<boolean> => {
    if (pending.current) {
      return pending.current.id === pageId
        ? pending.current.promise
        : Promise.reject(
            new Error(
              "Your saved shortcuts are still updating. Please try again.",
            ),
          );
    }
    const operation = (async () => {
      const active = session.current;
      if (!active)
        throw new Error(
          "Saved pages are unavailable in this browser. Reload to try again.",
        );
      let verified = false;
      try {
        // A sign-in change in another tab must not write into the previous
        // account's shortcuts merely because this app has remained open.
        const scope = await currentScope();
        if (!mounted.current)
          throw new Error("This workspace is no longer open.");
        if (savedPagesKey(scope) !== active.store.key) {
          session.current = null;
          setState({
            savedIds: new Set(),
            available: false,
            loading: false,
            error:
              "Your account or site changed. Reload to update your saved pages.",
            userId: null,
          });
          throw new Error(
            "Your account or site changed. Reload to update your saved pages.",
          );
        }
        verified = true;
        const result = active.store.toggle(pageId);
        setState((previous) => ({
          ...previous,
          savedIds: result.ids,
          available: true,
          error: null,
        }));
        return result.saved;
      } catch (cause) {
        if (mounted.current && session.current === active) {
          const error = savedPagesErrorMessage(cause);
          if (!verified) {
            session.current = null;
            setState({
              savedIds: new Set(),
              available: false,
              loading: false,
              error,
              userId: null,
            });
          } else
            try {
              const savedIds = active.store.read();
              setState((previous) => ({ ...previous, savedIds, error }));
            } catch {
              setState((previous) => ({
                ...previous,
                savedIds: new Set(),
                available: false,
                error,
              }));
            }
        }
        throw new Error(savedPagesErrorMessage(cause));
      }
    })();
    pending.current = { id: pageId, promise: operation };
    void operation
      .finally(() => {
        if (pending.current?.promise === operation) pending.current = null;
      })
      .catch(() => undefined);
    return operation;
  }, []);

  return { ...state, toggle };
}
