import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "../types";

const memory = new Map<string, string>();
vi.stubGlobal("window", {
  location: {
    hostname: "localhost",
    origin: "http://localhost",
    href: "http://localhost/",
    search: "",
  },
});
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
});
const { KnowledgeService, PageDeletionError } =
  await import("./sharepointService");
const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const context = {
  mode: "sharepoint" as const,
  webUrl: "https://tenant.test/sites/lab",
};
const pageRecord: Page = {
  Id: 10,
  Title: "Shared procedure",
  SpaceId: 1,
  ParentPageId: null,
  Content: "Instructions",
  Summary: "",
  Tags: [],
  Status: "Published",
  IsPinned: false,
  TemplateType: "blank",
  VersionCount: 1,
  AuthorId: 7,
  AuthorName: "Same display name",
  LastEditorName: "Same display name",
  Created: "2026-01-01T00:00:00Z",
  Modified: "2026-01-01T00:00:00Z",
  etag: '"1"',
};

function sharePointFixture() {
  const state = {
    actorId: 7 as number | undefined,
    owner: false,
    page: { ...pageRecord } as Page | undefined,
    childIds: [] as number[],
    denyIdentity: false,
    recycleFailure: false,
  };
  const fetcher = vi.fn(
    async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(String(input));
      const path = decodeURIComponent(url.pathname);
      if (path.endsWith("/currentuser"))
        return state.denyIdentity
          ? response({ error: { message: "Access denied" } }, 403)
          : response({
              Id: state.actorId,
              Title: "Same display name",
              IsSiteAdmin: state.owner,
            });
      if (path.endsWith("/contextinfo"))
        return response({
          FormDigestValue: "digest",
          FormDigestTimeoutSeconds: 1800,
        });
      if (path.includes("KB_")) return response({}, 404);
      const match = path.match(
        /getbytitle\('Metrology-Confluence - (Spaces|Pages|Versions)'\)(.*)$/,
      );
      if (!match) throw new Error(`Unexpected endpoint ${path}`);
      const [, list, suffix] = match;
      if (!suffix) return response({ Id: `list-${list}`, BaseTemplate: 100 });
      if (list === "Spaces" && suffix === "/items")
        return response({ value: [{ Id: 1, Title: "Lab", SortOrder: 1 }] });
      if (list === "Versions" && options?.method === "POST")
        return response({ Id: 30 }, 201);
      if (list === "Pages" && suffix === "/items") {
        if (url.searchParams.has("$filter")) {
          expect(url.searchParams.get("$filter")).toBe("ParentPageId eq 10");
          return response({ value: state.childIds.map((Id) => ({ Id })) });
        }
        return response({ value: state.page ? [state.page] : [] });
      }
      if (list === "Pages" && suffix === "/items(10)/recycle()") {
        expect(options?.method).toBe("POST");
        expect(options?.headers).toMatchObject({ "X-RequestDigest": "digest" });
        state.page = undefined;
        if (state.recycleFailure) throw new TypeError("Failed to fetch");
        return response({ value: "8e74ef97-5891-4efd-94fa-8e97ab8ba582" });
      }
      if (list === "Pages" && suffix === "/items(10)") {
        if (!state.page) return response({}, 404);
        if (options?.method === "POST") {
          const payload = JSON.parse(String(options.body));
          expect(payload).not.toHaveProperty("AuthorId");
          expect(payload).not.toHaveProperty("Author");
          expect(payload).not.toHaveProperty("EditorId");
          state.page = { ...state.page, ...payload };
        }
        return response(state.page);
      }
      throw new Error(`Unexpected operation ${options?.method} ${path}`);
    },
  );
  return {
    state,
    fetcher,
    service: new KnowledgeService(context, fetcher as typeof fetch),
  };
}
beforeEach(() => memory.clear());

describe("creator-only page deletion", () => {
  it("uses authoritative user IDs, with no display-name or site-owner override", async () => {
    const { service, state, fetcher } = sharePointFixture();
    expect(await service.canDeletePage(10)).toBe(true);
    state.actorId = 8;
    state.owner = true;
    expect(await service.canDeletePage(10)).toBe(false);
    await expect(service.deletePage(10)).rejects.toThrow(
      "Only the original creator",
    );
    expect(
      fetcher.mock.calls.every(([, options]) => options?.method === "GET"),
    ).toBe(true);
    expect(state.page?.AuthorId).toBe(7);
  });
  it("fails closed when the authoritative author or current identity is missing", async () => {
    const { service, state, fetcher } = sharePointFixture();
    state.page!.AuthorId = undefined;
    expect(await service.canDeletePage(10)).toBe(false);
    await expect(service.deletePage(10)).rejects.toThrow(
      "Only the original creator",
    );
    state.page!.AuthorId = 7;
    state.actorId = undefined;
    expect(await service.canDeletePage(10)).toBe(false);
    await expect(service.deletePage(10)).rejects.toThrow(
      "verify your user identity",
    );
    state.actorId = 7;
    state.denyIdentity = true;
    expect(await service.canDeletePage(10)).toBe(false);
    expect(
      fetcher.mock.calls.every(([, options]) => options?.method === "GET"),
    ).toBe(true);
  });
  it("recycles an own leaf page once and never deletes related lists", async () => {
    const { service, state, fetcher } = sharePointFixture();
    await service.deletePage(10);
    expect(state.page).toBeUndefined();
    const mutations = fetcher.mock.calls.filter(
      ([, options]) => options?.method === "POST",
    );
    expect(mutations).toHaveLength(2);
    expect(String(mutations[0][0])).toContain("/_api/contextinfo");
    expect(String(mutations[1][0])).toContain("/items(10)/recycle()");
    expect(mutations[1][1]?.headers).not.toHaveProperty("X-HTTP-Method");
    expect(await service.canDeletePage(10)).toBe(false);
  });
  it("blocks parents without excluding archived or other-user children", async () => {
    const { service, state, fetcher } = sharePointFixture();
    state.childIds = [99];
    await expect(service.deletePage(10)).rejects.toThrow("child pages");
    expect(
      fetcher.mock.calls.every(([, options]) => options?.method === "GET"),
    ).toBe(true);
    const childRead = fetcher.mock.calls.find(([url]) =>
      String(url).includes("$filter="),
    );
    expect(String(childRead?.[0])).not.toMatch(/Status|Author/);
    expect(state.page).toBeDefined();
  });
  it("does not repeat a recycle request after a lost response", async () => {
    const { service, state, fetcher } = sharePointFixture();
    state.recycleFailure = true;
    const error = await service.deletePage(10).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(PageDeletionError);
    expect(error).toMatchObject({
      retryBlocked: true,
      message: expect.stringContaining("delete result could not be confirmed"),
    });
    expect(state.page).toBeUndefined();
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes("/recycle()")),
    ).toHaveLength(1);
  });
  it("preserves the built-in creator and strips immutable IDs from SharePoint edit payloads", async () => {
    const { service, state } = sharePointFixture();
    state.actorId = 8;
    const edited = await service.savePage({
      ...pageRecord,
      AuthorId: 8,
      Title: "Edited by a teammate",
    });
    expect(edited.AuthorId).toBe(7);
    expect(state.page?.AuthorId).toBe(7);
  });
  it("keeps local creator identity and never reuses a deleted page ID", async () => {
    const service = new KnowledgeService({ mode: "local", webUrl: "" });
    const created = await service.savePage({
      Title: "Mine",
      SpaceId: 1,
      Content: "Body",
      AuthorId: 500,
    });
    expect(created.AuthorId).toBe(1);
    expect(await service.canDeletePage(created.Id)).toBe(true);
    const versionsBefore = await service.getVersions(created.Id);
    await service.deletePage(created.Id);
    expect(await service.canDeletePage(created.Id)).toBe(false);
    const next = await service.savePage({
      Title: "Next",
      SpaceId: 1,
      Content: "Body",
    });
    expect(next.Id).toBeGreaterThan(created.Id);
    expect(await service.getVersions(created.Id)).toEqual(versionsBefore);
    expect(
      (await service.getVersions(next.Id)).every((v) => v.PageId === next.Id),
    ).toBe(true);
  });
  it("does not infer an unknown local author from a matching display name", async () => {
    const service = new KnowledgeService({ mode: "local", webUrl: "" });
    const existing = (await service.getPages()).find((page) => page.Id === 5)!;
    const key = "metrology-confluence:demo:v1";
    const stored = JSON.parse(memory.get(key)!);
    stored.pages.find((page: Page) => page.Id === existing.Id).AuthorId =
      undefined;
    memory.set(key, JSON.stringify(stored));
    expect(await service.canDeletePage(existing.Id)).toBe(false);
    const edited = await service.savePage({
      ...existing,
      AuthorId: 1,
      Title: "Still unknown",
    });
    expect(edited.AuthorId).toBeUndefined();
    await expect(service.deletePage(existing.Id)).rejects.toThrow(
      "Only the original creator",
    );
  });
});
