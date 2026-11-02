// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedPagesStore, savedPagesKey } from "../services/savedPages";
import { useSavedPages } from "./useSavedPages";

const fixtures = vi.hoisted(() => ({
  identity: vi.fn(),
  context: {
    mode: "sharepoint",
    webUrl: "https://tenant.example/sites/metsof",
  },
}));
vi.mock("../services/sharepointService", () => ({
  detectContext: () => fixtures.context,
  service: { currentUserIdentity: fixtures.identity },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const scope = {
  mode: "sharepoint" as const,
  webUrl: "https://tenant.example/sites/metsof",
  userId: 7,
};
const roots: Root[] = [];
beforeEach(() => {
  window.localStorage.clear();
  fixtures.context.webUrl = scope.webUrl;
  fixtures.identity
    .mockReset()
    .mockResolvedValue({ Id: 7, Title: "Verified user" });
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  vi.restoreAllMocks();
  window.localStorage.clear();
});
async function mount() {
  let current!: ReturnType<typeof useSavedPages>;
  function Harness() {
    current = useSavedPages();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => {
    root.render(createElement(Harness));
  });
  return () => current;
}

describe("saved pages in the application", () => {
  it("loads only the verified account and reconciles same-key storage events and clearing", async () => {
    const store = new SavedPagesStore(scope, window.localStorage);
    store.toggle(2);
    const otherScope = { ...scope, userId: 99 };
    new SavedPagesStore(otherScope, window.localStorage).toggle(80);
    const state = await mount();
    expect(state()).toMatchObject({
      available: true,
      loading: false,
      userId: 7,
    });
    expect(state().savedIds).toEqual(new Set([2]));
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: savedPagesKey(otherScope),
          storageArea: window.localStorage,
        }),
      ),
    );
    expect(state().savedIds).toEqual(new Set([2]));
    store.toggle(3);
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: store.key,
          storageArea: window.localStorage,
        }),
      ),
    );
    expect(state().savedIds).toEqual(new Set([2, 3]));
    window.localStorage.clear();
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: null,
          storageArea: window.localStorage,
        }),
      ),
    );
    expect(state().savedIds).toEqual(new Set());
  });

  it("keeps verified identity when storage is corrupt, and never overwrites the record", async () => {
    const key = savedPagesKey(scope);
    window.localStorage.setItem(key, '{"version":99,"pageIds":[4]}');
    const state = await mount();
    expect(state()).toMatchObject({
      available: false,
      loading: false,
      userId: 7,
    });
    expect(state().error).toContain("invalid");
    await expect(state().toggle(2)).rejects.toThrow("unavailable");
    expect(window.localStorage.getItem(key)).toBe(
      '{"version":99,"pageIds":[4]}',
    );
  });

  it("keeps identity when storage is blocked but never trusts a display name without a valid user ID", async () => {
    const read = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementationOnce(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });
    const blocked = await mount();
    expect(blocked()).toMatchObject({ available: false, userId: 7 });
    expect(blocked().error).toContain("blocked local storage");
    read.mockClear();
    fixtures.identity.mockResolvedValue({ Id: 0, Title: "Verified user" });
    const unverified = await mount();
    expect(unverified()).toMatchObject({ available: false, userId: null });
    expect(unverified().error).toContain("could not be verified");
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps the actual saved state and verified identity after a quota failure", async () => {
    const store = new SavedPagesStore(scope, window.localStorage);
    store.toggle(2);
    const state = await mount();
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    await act(async () => {
      await expect(state().toggle(3)).rejects.toThrow("have not changed");
    });
    expect(state().savedIds).toEqual(new Set([2]));
    expect(state()).toMatchObject({ available: true, userId: 7 });
    expect(store.read()).toEqual(new Set([2]));
    await act(async () => {
      expect(await state().toggle(3)).toBe(true);
    });
    expect(state().savedIds).toEqual(new Set([2, 3]));
    expect(state().error).toBe(null);
  });

  it("fails closed when the account changes or cannot be verified before a write", async () => {
    const store = new SavedPagesStore(scope, window.localStorage);
    store.toggle(2);
    const state = await mount();
    fixtures.identity.mockResolvedValue({ Id: 9, Title: "Verified user" });
    await act(async () => {
      await expect(state().toggle(3)).rejects.toThrow(
        "account or site changed",
      );
    });
    expect(state()).toMatchObject({ available: false, userId: null });
    expect(state().savedIds).toEqual(new Set());
    expect(store.read()).toEqual(new Set([2]));
    expect(
      new SavedPagesStore({ ...scope, userId: 9 }, window.localStorage).read(),
    ).toEqual(new Set());

    fixtures.identity.mockResolvedValue({ Id: 7, Title: "Verified user" });
    const second = await mount();
    fixtures.identity.mockRejectedValue(new Error("Could not verify identity"));
    await act(async () => {
      await expect(second().toggle(5)).rejects.toThrow("verify identity");
    });
    expect(second()).toMatchObject({ available: false, userId: null });
    expect(store.read()).toEqual(new Set([2]));
  });

  it("deduplicates repeated clicks while the identity check is pending", async () => {
    const state = await mount();
    let resolveIdentity!: (value: { Id: number; Title: string }) => void;
    fixtures.identity.mockReturnValue(
      new Promise((resolve) => {
        resolveIdentity = resolve;
      }),
    );
    const first = state().toggle(6);
    const repeated = state().toggle(6);
    expect(repeated).toBe(first);
    await act(async () => {
      resolveIdentity({ Id: 7, Title: "Verified user" });
      expect(await first).toBe(true);
      expect(await repeated).toBe(true);
    });
    expect(state().savedIds).toEqual(new Set([6]));
  });
});
