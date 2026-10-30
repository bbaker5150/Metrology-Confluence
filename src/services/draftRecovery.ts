import type { Page, PageInput, PendingImage } from "../types";

export interface RecoveryScope {
  mode: "local" | "sharepoint";
  webUrl: string;
  userId: number;
}
/** The page that originally opened this editor, before a partial image save. */
export interface RecoveryOrigin {
  pageId?: number;
  spaceId?: number;
  parentPageId?: number | null;
}
export interface RecoverySnapshot {
  page: PageInput;
  changeNote: string;
  sourceMode: boolean;
  retryBlocked: boolean;
  pendingImages: PendingImage[];
}
export interface RecoverySummary {
  id: string;
  title: string;
  updatedAt: string;
  pageId?: number;
  spaceId: number;
  parentPageId: number | null;
  imageCount: number;
}
export interface RecoveredDraft extends RecoverySnapshot {
  conflict: string | null;
  sourceRevision: string;
}
interface StoredImage {
  id: string;
  previewUrl: string;
  name: string;
  type: string;
  lastModified: number;
  bytes: Blob;
}
interface StoredDraft {
  key: string;
  scope: string;
  schema: 1;
  id: string;
  revision: string;
  origin: RecoveryOrigin;
  updatedAt: string;
  page: PageInput;
  changeNote: string;
  sourceMode: boolean;
  retryBlocked: boolean;
  images: StoredImage[];
}

export const RECOVERY_DATABASE = "metrology-confluence-recovery";
const STORE = "drafts";
const plainFields: (keyof Page)[] = [
  "Id",
  "Title",
  "SpaceId",
  "ParentPageId",
  "Content",
  "Summary",
  "Tags",
  "Status",
  "IsPinned",
  "TemplateType",
  "VersionCount",
  "AuthorId",
  "AuthorName",
  "LastEditorName",
  "Modified",
  "Created",
  "etag",
];

export function recoveryScopeKey(scope: RecoveryScope): string {
  if (!Number.isSafeInteger(scope.userId) || scope.userId <= 0)
    throw new Error("Your account could not be verified for local recovery.");
  const url = new URL(scope.webUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("The workspace could not be verified for local recovery.");
  return JSON.stringify([
    scope.mode,
    url.href.replace(/\/+$/, ""),
    scope.userId,
  ]);
}

function copyPage(page: PageInput): PageInput {
  const result: Record<string, unknown> = {};
  for (const field of plainFields)
    if (page[field] !== undefined)
      result[field] = field === "Tags" ? [...(page.Tags || [])] : page[field];
  return result as unknown as PageInput;
}
const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sourcePattern = (url: string) =>
  new RegExp(
    `(<img\\b[^>]*?\\bsrc\\s*=\\s*)(["'])${escapePattern(url)}\\2`,
    "gi",
  );
const temporarySource = /<img\b[^>]*?\bsrc\s*=\s*(["'])blob:/i;
function replaceSource(content: string, before: string, after: string) {
  return content.replace(
    sourcePattern(before),
    (_match, prefix: string, quote: string) =>
      `${prefix}${quote}${after}${quote}`,
  );
}

/** Metadata-only fingerprint; the file bytes are stored in IndexedDB, never JSON. */
export function recoveryFingerprint(snapshot: RecoverySnapshot): string {
  return JSON.stringify([
    copyPage(snapshot.page),
    snapshot.changeNote,
    snapshot.sourceMode,
    snapshot.retryBlocked,
    snapshot.pendingImages.map(({ id, previewUrl, file }) => [
      id,
      previewUrl,
      file.name,
      file.type,
      file.size,
      file.lastModified,
    ]),
  ]);
}

export function recoveryErrorMessage(error: unknown): string {
  const name =
    error instanceof Error || error instanceof DOMException ? error.name : "";
  const detail =
    name === "QuotaExceededError"
      ? "Browser storage is full."
      : name === "SecurityError" || name === "InvalidStateError"
        ? "Your browser has blocked local storage."
        : error instanceof Error
          ? error.message
          : "Browser storage is unavailable.";
  return `Local recovery is unavailable. ${detail} You can still save this page normally. Keep this tab open until you save or download a copy.`;
}

/**
 * Device-only recovery. Every operation is scoped to a verified account and site.
 * No expiration, automatic eviction, localStorage fallback, or SharePoint writes.
 */
export class DraftRecoveryStore {
  private connection?: Promise<IDBDatabase>;
  constructor(
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
    private readonly databaseName = RECOVERY_DATABASE,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (!this.factory)
      return Promise.reject(
        new Error("IndexedDB is not supported in this browser."),
      );
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      let finished = false;
      const request = this.factory!.open(this.databaseName, 1);
      const timeout = setTimeout(
        () => fail(new Error("Browser storage did not respond.")),
        4000,
      );
      const fail = (error: unknown) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        reject(error);
      };
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          const store = request.result.createObjectStore(STORE, {
            keyPath: "key",
          });
          store.createIndex("scope", "scope");
        }
      };
      request.onerror = () =>
        fail(
          request.error || new Error("Browser storage could not be opened."),
        );
      request.onblocked = () =>
        fail(
          new Error(
            "Another tab is blocking browser storage. Close older app tabs and reload.",
          ),
        );
      request.onsuccess = () => {
        if (finished) {
          request.result.close();
          return;
        }
        finished = true;
        clearTimeout(timeout);
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
    return this.connection;
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      let request: IDBRequest<T>;
      try {
        request = run(transaction.objectStore(STORE));
      } catch (error) {
        transaction.abort();
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () =>
        reject(
          transaction.error ||
            request.error ||
            new Error("Browser storage failed."),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ||
            request.error ||
            new Error("Browser storage write was interrupted."),
        );
    });
  }

  async list(
    scope: RecoveryScope,
    origin: RecoveryOrigin,
    excludeId?: string,
  ): Promise<RecoverySummary[]> {
    const scopeKey = recoveryScopeKey(scope);
    const records = await this.transaction<StoredDraft[]>("readonly", (store) =>
      store.index("scope").getAll(scopeKey),
    );
    return records
      .filter(
        (record) =>
          record.schema === 1 &&
          record.id !== excludeId &&
          (origin.pageId
            ? record.origin.pageId === origin.pageId ||
              record.page.Id === origin.pageId
            : !record.origin.pageId),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((record) => ({
        id: record.id,
        title: record.page.Title || "Untitled page",
        updatedAt: record.updatedAt,
        pageId: record.page.Id,
        spaceId: record.page.SpaceId,
        parentPageId: record.page.ParentPageId ?? null,
        imageCount: record.images.length,
      }));
  }

  async write(
    scope: RecoveryScope,
    id: string,
    origin: RecoveryOrigin,
    snapshot: RecoverySnapshot,
  ): Promise<string> {
    const scopeKey = recoveryScopeKey(scope);
    if (!id) throw new Error("The edit session could not be identified.");
    const images: StoredImage[] = [];
    let unresolved = snapshot.page.Content;
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();
    for (const image of snapshot.pendingImages) {
      if (!sourcePattern(image.previewUrl).test(snapshot.page.Content))
        continue;
      if (
        !/^[a-z0-9-]{8,40}$/i.test(image.id) ||
        !/^blob:[^\s<>"']+$/.test(image.previewUrl) ||
        seenIds.has(image.id) ||
        seenUrls.has(image.previewUrl)
      )
        throw new Error(
          "An image preview could not be copied. Remove it and insert it again.",
        );
      seenIds.add(image.id);
      seenUrls.add(image.previewUrl);
      images.push({
        id: image.id,
        previewUrl: image.previewUrl,
        name: image.file.name,
        type: image.file.type,
        lastModified: image.file.lastModified,
        bytes: image.file.slice(0, image.file.size, image.file.type),
      });
      unresolved = replaceSource(
        unresolved,
        image.previewUrl,
        "recovery-image",
      );
    }
    if (temporarySource.test(unresolved))
      throw new Error(
        "An image preview is missing its original file, so a complete recovery copy could not be saved.",
      );
    const updatedAt = new Date().toISOString();
    const record: StoredDraft = {
      key: JSON.stringify([scopeKey, id]),
      scope: scopeKey,
      schema: 1,
      id,
      revision: crypto.randomUUID(),
      origin: { ...origin },
      updatedAt,
      page: copyPage(snapshot.page),
      changeNote: snapshot.changeNote,
      sourceMode: snapshot.sourceMode,
      retryBlocked: snapshot.retryBlocked,
      images,
    };
    await this.transaction("readwrite", (store) => store.put(record));
    return updatedAt;
  }

  async remove(scope: RecoveryScope, id: string): Promise<void> {
    const scopeKey = recoveryScopeKey(scope);
    await this.transaction("readwrite", (store) =>
      store.delete(JSON.stringify([scopeKey, id])),
    );
  }

  /** A live source tab may have saved newer work since this copy was read. */
  async removeIfUnchanged(
    scope: RecoveryScope,
    id: string,
    revision: string,
  ): Promise<boolean> {
    const scopeKey = recoveryScopeKey(scope);
    const key = JSON.stringify([scopeKey, id]);
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const objectStore = transaction.objectStore(STORE);
      const request = objectStore.get(key);
      let removed = false;
      request.onsuccess = () => {
        const record = request.result as StoredDraft | undefined;
        if (record && revision && record.revision === revision) {
          objectStore.delete(key);
          removed = true;
        }
      };
      transaction.oncomplete = () => resolve(removed);
      transaction.onerror = transaction.onabort = () =>
        reject(
          transaction.error ||
            request.error ||
            new Error("Browser recovery cleanup failed."),
        );
    });
  }

  async restore(
    scope: RecoveryScope,
    id: string,
    currentPage?: Partial<Page>,
  ): Promise<RecoveredDraft> {
    const scopeKey = recoveryScopeKey(scope);
    const record = await this.transaction<StoredDraft | undefined>(
      "readonly",
      (store) => store.get(JSON.stringify([scopeKey, id])),
    );
    if (!record || record.schema !== 1 || record.scope !== scopeKey)
      throw new Error(
        "This recovery copy is no longer available for this account and workspace.",
      );
    const page = copyPage(record.page);
    const pendingImages: PendingImage[] = [];
    try {
      for (const image of record.images) {
        const file = new File([image.bytes], image.name, {
          type: image.type,
          lastModified: image.lastModified,
        });
        const previewUrl = URL.createObjectURL(file);
        pendingImages.push({ id: image.id, file, previewUrl });
        page.Content = replaceSource(
          page.Content,
          image.previewUrl,
          previewUrl,
        );
      }
    } catch (error) {
      pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      throw error;
    }
    const missingBaseline = Boolean(page.Id && !page.etag);
    const changed = Boolean(
      page.Id && currentPage?.Id === page.Id && currentPage.etag !== page.etag,
    );
    const conflict = missingBaseline
      ? "This copy has no original page revision. Download your recovered work and reload the current page before editing; saving this copy is blocked."
      : changed
        ? "This page changed after this local copy was made. Your recovered work keeps its original revision; saving is blocked by the revision check. Download your work and compare it with the current page."
        : null;
    return {
      page,
      changeNote: record.changeNote,
      sourceMode: record.sourceMode,
      retryBlocked: record.retryBlocked || missingBaseline,
      pendingImages,
      conflict,
      sourceRevision: record.revision,
    };
  }
}

/** Serialize writes and make clearing a final barrier, including during unmount. */
export class RecoverySession {
  readonly id = crypto.randomUUID();
  private stopped = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly store: DraftRecoveryStore,
    readonly scope: RecoveryScope,
    readonly origin: RecoveryOrigin,
  ) {}
  write(snapshot: RecoverySnapshot): Promise<string | null> {
    if (this.stopped) return Promise.resolve(null);
    const next = this.queue
      .catch(() => undefined)
      .then(() =>
        this.stopped
          ? null
          : this.store.write(this.scope, this.id, this.origin, snapshot),
      );
    this.queue = next;
    return next;
  }
  /** Until the server response is known, a recovered save must not be repeated. */
  prepareSave(snapshot: RecoverySnapshot): Promise<string | null> {
    return this.write({ ...snapshot, retryBlocked: true });
  }
  async clear(): Promise<void> {
    this.stopped = true;
    await this.queue.catch(() => undefined);
    await this.store.remove(this.scope, this.id);
  }
}
