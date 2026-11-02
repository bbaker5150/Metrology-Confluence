import { recoveryScopeKey, type RecoveryScope } from "./draftRecovery";

export const MAX_SAVED_PAGES = 5000;
export type SavedPagesStorage = Pick<Storage, "getItem" | "setItem">;

export function savedPagesKey(scope: RecoveryScope): string {
  if (scope.mode !== "local" && scope.mode !== "sharepoint")
    throw new Error("The workspace could not be verified for saved pages.");
  try {
    return `metrology-confluence:saved:v1:${recoveryScopeKey(scope)}`;
  } catch {
    throw new Error(
      "Your account or site could not be verified for saved pages. Reload to try again.",
    );
  }
}

function validId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function parseSavedPages(raw: string | null): Set<number> {
  if (raw === null) return new Set();
  let record: unknown;
  try {
    if (raw.length > 100000) throw new Error("Oversized saved-pages record");
    record = JSON.parse(raw);
  } catch {
    throw new Error(
      "Saved pages data in this browser is invalid. Existing shortcuts have not been overwritten.",
    );
  }
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    !("version" in record) ||
    record.version !== 1 ||
    !("pageIds" in record) ||
    !Array.isArray(record.pageIds) ||
    record.pageIds.length > MAX_SAVED_PAGES ||
    !record.pageIds.every(validId) ||
    Object.keys(record).some((key) => key !== "version" && key !== "pageIds")
  )
    throw new Error(
      "Saved pages data in this browser is invalid or from an unsupported version. Existing shortcuts have not been overwritten.",
    );
  return new Set(record.pageIds);
}

export function savedPagesErrorMessage(cause: unknown): string {
  const name =
    cause instanceof Error || cause instanceof DOMException ? cause.name : "";
  if (name === "QuotaExceededError")
    return "This browser has no room to save the shortcut. Your saved pages have not changed.";
  if (name === "SecurityError" || name === "InvalidStateError")
    return "Saved pages are unavailable because this browser blocked local storage. You can still read and edit pages normally.";
  return cause instanceof Error
    ? cause.message
    : "Saved pages could not be updated in this browser. Your pages in SharePoint are unchanged.";
}

/** Stores only page IDs, scoped to a verified account, site, and local/SharePoint mode. */
export class SavedPagesStore {
  readonly key: string;
  constructor(
    scope: RecoveryScope,
    private readonly storage: SavedPagesStorage,
  ) {
    this.key = savedPagesKey(scope);
  }

  read(): Set<number> {
    return parseSavedPages(this.storage.getItem(this.key));
  }

  toggle(pageId: number): { saved: boolean; ids: Set<number> } {
    if (!validId(pageId))
      throw new Error("Choose an existing page to save for later.");
    // Read the latest persisted value, not a React snapshot that may predate
    // another tab's update. Storage events reconcile the other open tabs.
    const ids = this.read();
    const saved = !ids.has(pageId);
    if (saved) {
      if (ids.size >= MAX_SAVED_PAGES)
        throw new Error(
          "You have reached this browser's saved-page limit. Remove a shortcut before adding another.",
        );
      ids.add(pageId);
    } else ids.delete(pageId);
    this.storage.setItem(
      this.key,
      JSON.stringify({ version: 1, pageIds: [...ids] }),
    );
    return { saved, ids };
  }
}
