import { describe, expect, it, vi } from "vitest";
import {
  MAX_SAVED_PAGES,
  SavedPagesStore,
  savedPagesErrorMessage,
  savedPagesKey,
} from "./savedPages";

const scope = {
  mode: "sharepoint" as const,
  webUrl: "https://tenant.example/sites/metsof",
  userId: 7,
};
function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
  };
}

describe("personal saved-page shortcuts", () => {
  it("stores only IDs and isolates accounts, sites, and demo mode", () => {
    const storage = memoryStorage();
    const store = new SavedPagesStore(scope, storage);
    expect(store.toggle(12)).toEqual({ saved: true, ids: new Set([12]) });
    expect(JSON.parse(storage.entries.get(store.key)!)).toEqual({
      version: 1,
      pageIds: [12],
    });
    expect(
      new SavedPagesStore(
        { ...scope, webUrl: `${scope.webUrl}/` },
        storage,
      ).read(),
    ).toEqual(new Set([12]));
    for (const other of [
      { ...scope, userId: 8 },
      { ...scope, webUrl: "https://tenant.example/sites/another" },
      { ...scope, mode: "local" as const },
    ])
      expect(new SavedPagesStore(other, storage).read()).toEqual(new Set());
    for (const userId of [0, -1, NaN, 1.5])
      expect(() => savedPagesKey({ ...scope, userId })).toThrow("verified");
    expect(() =>
      savedPagesKey({
        ...scope,
        webUrl: "https://user:secret@tenant.example/",
      }),
    ).toThrow("verified");
  });

  it("reads another tab's latest changes before toggling and removes existing shortcuts", () => {
    const storage = memoryStorage();
    const first = new SavedPagesStore(scope, storage);
    const second = new SavedPagesStore(scope, storage);
    first.toggle(1);
    second.toggle(2);
    expect(first.toggle(3).ids).toEqual(new Set([1, 2, 3]));
    expect(second.toggle(1)).toEqual({ saved: false, ids: new Set([2, 3]) });
    expect(first.read()).toEqual(new Set([2, 3]));
  });

  it("rejects malformed or unsupported records without overwriting them", () => {
    const storage = memoryStorage();
    const store = new SavedPagesStore(scope, storage);
    const invalid = [
      "not JSON",
      "null",
      "[]",
      '{"version":2,"pageIds":[1]}',
      '{"version":1,"pageIds":["1"]}',
      '{"version":1,"pageIds":[0]}',
      '{"version":1,"pageIds":[1],"userName":"Untrusted"}',
      JSON.stringify({
        version: 1,
        pageIds: Array(MAX_SAVED_PAGES + 1).fill(1),
      }),
      " ".repeat(100001),
    ];
    for (const raw of invalid) {
      storage.entries.set(store.key, raw);
      expect(() => store.read()).toThrow("invalid");
      expect(() => store.toggle(10)).toThrow("invalid");
      expect(storage.entries.get(store.key)).toBe(raw);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("enforces the limit without preventing removal and rejects invalid IDs", () => {
    const storage = memoryStorage();
    const store = new SavedPagesStore(scope, storage);
    storage.entries.set(
      store.key,
      JSON.stringify({
        version: 1,
        pageIds: Array.from(
          { length: MAX_SAVED_PAGES },
          (_, index) => index + 1,
        ),
      }),
    );
    expect(() => store.toggle(MAX_SAVED_PAGES + 1)).toThrow("limit");
    expect(store.toggle(1).saved).toBe(false);
    expect(store.toggle(MAX_SAVED_PAGES + 1).saved).toBe(true);
    for (const id of [-1, 0, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => store.toggle(id)).toThrow("existing page");
  });

  it("does not claim a successful update when quota or browser access fails", () => {
    const storage = memoryStorage();
    const store = new SavedPagesStore(scope, storage);
    store.toggle(4);
    const quota = new DOMException("Full", "QuotaExceededError");
    storage.setItem.mockImplementationOnce(() => {
      throw quota;
    });
    expect(() => store.toggle(8)).toThrow(quota);
    expect(store.read()).toEqual(new Set([4]));
    expect(savedPagesErrorMessage(quota)).toContain("have not changed");
    const blocked = new DOMException("Blocked", "SecurityError");
    storage.getItem.mockImplementationOnce(() => {
      throw blocked;
    });
    expect(() => store.read()).toThrow(blocked);
    expect(savedPagesErrorMessage(blocked)).toContain(
      "read and edit pages normally",
    );
  });
});
