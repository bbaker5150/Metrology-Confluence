import { describe, expect, it, vi } from "vitest";
import { updateRouteHash } from "./navigation";

function host(href: string) {
  return {
    location: { href },
    history: { pushState: vi.fn(), replaceState: vi.fn() },
  };
}

describe("host-safe navigation", () => {
  it("retains the SharePoint document path and siteUrl query when opening a page", () => {
    const win = host(
      "https://tenant.test/sites/lab/SiteAssets/index.html?siteUrl=https%3A%2F%2Ftenant.test%2Fsites%2Flab#page=1",
    );
    expect(updateRouteHash("#page=2", "push", win)).toBe(true);
    expect(win.history.pushState).toHaveBeenCalledWith(
      null,
      "",
      "https://tenant.test/sites/lab/SiteAssets/index.html?siteUrl=https%3A%2F%2Ftenant.test%2Fsites%2Flab#page=2",
    );
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });
  it.each([
    "blob:https://tenant.test/preview-id",
    "blob:null/preview-id",
    "file:///tmp/knowledge%20hub.html",
    "about:srcdoc",
  ])(
    "preserves the document scheme for %s and clears only its fragment",
    (href) => {
      const win = host(`${href}#page=10`);
      expect(updateRouteHash("", "replace", win)).toBe(true);
      expect(win.history.replaceState).toHaveBeenCalledWith(null, "", href);
      expect(updateRouteHash("#page=20", "push", win)).toBe(true);
      expect(win.history.pushState).toHaveBeenCalledWith(
        null,
        "",
        `${href}#page=20`,
      );
    },
  );
  it.each(["push", "replace"] as const)(
    "does not throw or try another navigation when a sandbox rejects %s",
    (mode) => {
      const win = host("blob:https://tenant.test/preview-id#page=1");
      const fail = () => {
        throw new DOMException(
          "The host has an opaque origin",
          "SecurityError",
        );
      };
      win.history.pushState.mockImplementation(fail);
      win.history.replaceState.mockImplementation(fail);
      expect(updateRouteHash("#page=2", mode, win)).toBe(false);
      expect(
        win.history.pushState.mock.calls.length +
          win.history.replaceState.mock.calls.length,
      ).toBe(1);
      expect(win.location.href).toBe(
        "blob:https://tenant.test/preview-id#page=1",
      );
    },
  );
});
