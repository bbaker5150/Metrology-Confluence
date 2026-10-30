import { describe, expect, it, vi, afterEach } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  DraftRecoveryStore,
  RecoverySession,
  recoveryErrorMessage,
  recoveryScopeKey,
  type RecoveryScope,
  type RecoverySnapshot,
} from "./draftRecovery";

const scope: RecoveryScope = {
  mode: "sharepoint",
  webUrl: "https://tenant.example/sites/metsof",
  userId: 7,
};
const newOrigin = { spaceId: 2, parentPageId: 10 };
const snapshot = (
  overrides: Partial<RecoverySnapshot> = {},
): RecoverySnapshot => ({
  page: {
    Title: "Calibration guide",
    SpaceId: 2,
    ParentPageId: 10,
    Content: "<p>Unsaved work</p>",
    Tags: ["calibration"],
    Summary: "Local changes",
    TemplateType: "sop",
    Status: "Draft",
  },
  changeNote: "Clarify the uncertainty budget",
  sourceMode: false,
  retryBlocked: false,
  pendingImages: [],
  ...overrides,
});
const makeStore = () => new DraftRecoveryStore(new IDBFactory());
afterEach(() => vi.restoreAllMocks());

describe("device-only draft recovery", () => {
  it("isolates accounts, sites and local/demo mode; normalizes trailing site slashes", async () => {
    const store = makeStore();
    await store.write(scope, "first", newOrigin, snapshot());
    expect(
      await store.list({ ...scope, webUrl: `${scope.webUrl}/` }, {}),
    ).toHaveLength(1);
    for (const other of [
      { ...scope, userId: 8 },
      { ...scope, webUrl: "https://tenant.example/sites/other" },
      { ...scope, mode: "local" as const },
    ]) {
      expect(await store.list(other, {})).toEqual([]);
      await expect(store.restore(other, "first")).rejects.toThrow(
        "account and workspace",
      );
      await store.remove(other, "first");
    }
    expect(await store.list(scope, {})).toHaveLength(1);
    expect(() => recoveryScopeKey({ ...scope, userId: 0 })).toThrow("account");
    expect(() => recoveryScopeKey({ ...scope, webUrl: "" })).toThrow();
  });

  it("keeps simultaneous editing sessions independent and discovers new child drafts from any space", async () => {
    const store = makeStore();
    const first = new RecoverySession(store, scope, newOrigin);
    const second = new RecoverySession(store, scope, newOrigin);
    expect(first.id).not.toEqual(second.id);
    await Promise.all([
      first.write(snapshot()),
      second.write(snapshot({ changeNote: "Second tab" })),
    ]);
    expect(
      await store.list(scope, { spaceId: 99, parentPageId: null }),
    ).toHaveLength(2);
    expect(await store.list(scope, newOrigin, first.id)).toHaveLength(1);
    await first.clear();
    expect((await store.list(scope, {})).map((copy) => copy.id)).toEqual([
      second.id,
    ]);
  });

  it("keeps image bytes and metadata across reload with fresh URLs and stable upload identifiers", async () => {
    const factory = new IDBFactory();
    const store = new DraftRecoveryStore(factory);
    const file = new File(
      [new Uint8Array([137, 80, 78, 71, 42])],
      "calibration.png",
      { type: "image/png", lastModified: 12345 },
    );
    const pending = {
      id: "image-123456",
      file,
      previewUrl: "blob:https://tenant.example/old-preview",
    };
    const source = snapshot({ pendingImages: [pending] });
    source.page.Content = `<p>${pending.previewUrl}</p><img alt="diagram" src='${pending.previewUrl}'><img src="/sites/metsof/existing.png">`;
    await store.write(scope, "with-image", newOrigin, source);
    const reloaded = new DraftRecoveryStore(factory);
    const result = await reloaded.restore(scope, "with-image");
    const restoredImage = result.pendingImages[0];
    expect(restoredImage.id).toBe(pending.id);
    expect(restoredImage.previewUrl).not.toBe(pending.previewUrl);
    expect(restoredImage.file.name).toBe(file.name);
    expect(restoredImage.file.type).toBe(file.type);
    expect(restoredImage.file.lastModified).toBe(file.lastModified);
    expect(new Uint8Array(await restoredImage.file.arrayBuffer())).toEqual(
      new Uint8Array(await file.arrayBuffer()),
    );
    expect(result.page.Content).toContain(`src='${restoredImage.previewUrl}'`);
    expect(result.page.Content).toContain(`<p>${pending.previewUrl}</p>`);
    expect(result.page.Content).toContain('src="/sites/metsof/existing.png"');
    expect(result.changeNote).toBe(source.changeNote);
    expect(result.page.Tags).toEqual(source.page.Tags);
    URL.revokeObjectURL(restoredImage.previewUrl);
  });

  it("preserves the original revision and reports stale content rather than adopting a fresh etag", async () => {
    const store = makeStore();
    const source = snapshot();
    source.page = { ...source.page, Id: 40, etag: '"2"' };
    await store.write(scope, "existing", { pageId: 40 }, source);
    expect(await store.list(scope, {})).toEqual([]);
    expect(await store.list(scope, { pageId: 41 })).toEqual([]);
    const restored = await store.restore(scope, "existing", {
      Id: 40,
      etag: '"3"',
    });
    expect(restored.page.etag).toBe('"2"');
    expect(restored.conflict).toContain("page changed");
    expect(
      (await store.restore(scope, "existing", { Id: 40, etag: '"2"' }))
        .conflict,
    ).toBeNull();
  });

  it("retains partially saved page IDs, permanent images, pending files and uncertain-save blocking", async () => {
    const store = makeStore();
    const source = snapshot({ retryBlocked: true });
    source.page = {
      ...source.page,
      Id: 91,
      etag: '"4"',
      Content:
        '<img src="/sites/metsof/Lists/Pages/Attachments/91/uploaded.png"><p>Unresolved save</p>',
    };
    await store.write(scope, "partial", newOrigin, source);
    expect(await store.list(scope, {})).toHaveLength(1);
    expect(await store.list(scope, { pageId: 91 })).toHaveLength(1);
    const restored = await store.restore(scope, "partial");
    expect(restored.page.Id).toBe(91);
    expect(restored.page.etag).toBe('"4"');
    expect(restored.page.Content).toEqual(source.page.Content);
    expect(restored.retryBlocked).toBe(true);
    const missing = snapshot();
    missing.page.Id = 92;
    await store.write(scope, "missing-etag", { pageId: 92 }, missing);
    expect((await store.restore(scope, "missing-etag")).retryBlocked).toBe(
      true,
    );
  });

  it("does not replace a valid copy with an unrecoverable image preview", async () => {
    const store = makeStore();
    await store.write(scope, "last-good", newOrigin, snapshot());
    const broken = snapshot();
    broken.page.Content = '<img src="blob:missing-image-file">';
    await expect(
      store.write(scope, "last-good", newOrigin, broken),
    ).rejects.toThrow("missing its original file");
    expect((await store.restore(scope, "last-good")).page.Content).toBe(
      "<p>Unsaved work</p>",
    );
  });

  it("clears after an in-flight write and prevents queued or later writes resurrecting the session", async () => {
    const store = makeStore();
    const originalWrite = store.write.bind(store);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const spy = vi.spyOn(store, "write").mockImplementation(async (...args) => {
      started();
      await gate;
      return originalWrite(...args);
    });
    const session = new RecoverySession(store, scope, newOrigin);
    const first = session.write(snapshot());
    await entered;
    const queued = session.write(
      snapshot({ changeNote: "Should never write" }),
    );
    const clearing = session.clear();
    release();
    await Promise.all([first, queued, clearing]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await store.list(scope, {})).toEqual([]);
    expect(await session.write(snapshot())).toBeNull();
  });

  it("marks a pre-save copy uncertain until the save result is known, even if the tab closes", async () => {
    const store = makeStore();
    const session = new RecoverySession(store, scope, newOrigin);
    await session.write(snapshot());
    await session.prepareSave(snapshot());
    const interrupted = await store.restore(scope, session.id);
    expect(interrupted.retryBlocked).toBe(true);
    expect(interrupted.page.Id).toBeUndefined();
    // A recoverable image failure can subsequently supply a known server draft.
    const knownFailure = snapshot();
    knownFailure.page = { ...knownFailure.page, Id: 93, etag: '"1"' };
    await session.write(knownFailure);
    const retry = await store.restore(scope, session.id);
    expect(retry.retryBlocked).toBe(false);
    expect(retry.page.Id).toBe(93);
  });

  it("does not delete a live tab's newer recovery copy when another tab restores an older revision", async () => {
    const store = makeStore();
    await store.write(scope, "live-tab", newOrigin, snapshot());
    const readByOtherTab = await store.restore(scope, "live-tab");
    await store.write(
      scope,
      "live-tab",
      newOrigin,
      snapshot({ changeNote: "Newer unsaved work" }),
    );
    expect(
      await store.removeIfUnchanged(
        scope,
        "live-tab",
        readByOtherTab.sourceRevision,
      ),
    ).toBe(false);
    const newest = await store.restore(scope, "live-tab");
    expect(newest.changeNote).toBe("Newer unsaved work");
    expect(
      await store.removeIfUnchanged(scope, "live-tab", newest.sourceRevision),
    ).toBe(true);
    expect(await store.list(scope, {})).toEqual([]);
  });

  it("preserves the previous copy when storage fills up and explains that normal saving remains available", async () => {
    const store = makeStore();
    await store.write(scope, "last-good", newOrigin, snapshot());
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    await expect(
      store.write(
        scope,
        "last-good",
        newOrigin,
        snapshot({ changeNote: "newer" }),
      ),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect((await store.restore(scope, "last-good")).changeNote).toBe(
      snapshot().changeNote,
    );
    expect(
      recoveryErrorMessage(new DOMException("Full", "QuotaExceededError")),
    ).toContain("Browser storage is full");
    expect(
      recoveryErrorMessage(new DOMException("Full", "QuotaExceededError")),
    ).toContain("save this page normally");
  });

  it("fails promptly and visibly when browser storage is blocked", async () => {
    const request = {} as IDBOpenDBRequest;
    const factory = {
      open: () => {
        queueMicrotask(() =>
          request.onblocked?.call(
            request,
            new Event("blocked") as IDBVersionChangeEvent,
          ),
        );
        return request;
      },
    } as unknown as IDBFactory;
    await expect(
      new DraftRecoveryStore(factory).list(scope, {}),
    ).rejects.toThrow("blocking browser storage");
  });
});
