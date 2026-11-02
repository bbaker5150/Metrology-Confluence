import { beforeEach, describe, expect, it, vi } from "vitest";
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
beforeEach(() => memory.clear());
const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function fixture() {
  const state = {
    children: [] as number[],
    failRecycle: false,
    denied: false,
    fields: { Id: 1, Title: "Lab", AccentColor: "#207de9", SortOrder: 1 },
  };
  const fetcher = vi.fn(
    async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(String(input)),
        path = decodeURIComponent(url.pathname);
      if (path.endsWith("/contextinfo"))
        return response({
          FormDigestValue: "digest",
          FormDigestTimeoutSeconds: 1800,
        });
      if (path.includes("KB_")) return response({}, 404);
      const match = path.match(
        /getbytitle\('Metrology-Confluence - (Spaces|Pages)'\)(.*)$/,
      );
      if (!match) throw new Error(`Unexpected endpoint ${path}`);
      const [, list, suffix] = match;
      if (!suffix) return response({ Id: list, BaseTemplate: 100 });
      if (list === "Pages" && suffix === "/items") {
        expect(url.searchParams.get("$filter")).toBe("SpaceId eq 1");
        expect(url.searchParams.get("$filter")).not.toContain("Status");
        return response({ value: state.children.map((Id) => ({ Id })) });
      }
      if (suffix === "/items") return response({ value: [state.fields] });
      if (suffix === "/items(1)" && options?.method === "POST") {
        expect(options.headers).toMatchObject({
          "X-RequestDigest": "digest",
          "X-HTTP-Method": "MERGE",
          "IF-MATCH": "*",
        });
        if (state.denied)
          return response({ error: { message: "Access denied" } }, 403);
        Object.assign(state.fields, JSON.parse(String(options.body)));
        return response(null, 204);
      }
      if (suffix === "/items(1)/recycle()") {
        expect(options?.headers).toMatchObject({ "X-RequestDigest": "digest" });
        if (state.failRecycle) throw new TypeError("Lost response");
        return response({ value: "recycle-id" });
      }
      throw new Error(`Unexpected endpoint ${path}`);
    },
  );
  return {
    state,
    fetcher,
    service: new KnowledgeService(
      { mode: "sharepoint", webUrl: "https://tenant.test/sites/lab" },
      fetcher as typeof fetch,
    ),
  };
}
describe("space management", () => {
  it("renames and recolors without changing links, page membership, or other space fields", async () => {
    const service = new KnowledgeService({ mode: "local", webUrl: "" });
    const space = (await service.getSpaces())[0],
      pages = await service.getPages();
    const renamed = await service.updateSpace(space.Id, {
      Title: "  Reference lab  ",
    });
    expect(renamed).toEqual({ ...space, Title: "Reference lab" });
    expect(
      await service.updateSpace(space.Id, { AccentColor: "#AABBCC" }),
    ).toEqual({ ...renamed, AccentColor: "#aabbcc" });
    expect(await service.getPages()).toEqual(pages);
    await expect(service.updateSpace(space.Id, { Title: " " })).rejects.toThrow(
      "space name",
    );
    await expect(
      service.updateSpace(space.Id, { AccentColor: "url(evil)" }),
    ).rejects.toThrow("hex color");
  });
  it("blocks occupied spaces, including drafts and archived pages, and does not reuse deleted space IDs", async () => {
    const service = new KnowledgeService({ mode: "local", webUrl: "" });
    await expect(service.deleteSpace(1)).rejects.toThrow("every page");
    const space = await service.createSpace("Empty", "");
    await service.deleteSpace(space.Id);
    expect((await service.getSpaces()).some((s) => s.Id === space.Id)).toBe(
      false,
    );
    expect((await service.createSpace("Next", "")).Id).toBeGreaterThan(
      space.Id,
    );
  });
  it("uses digest-backed MERGE and respects SharePoint denials", async () => {
    const { service, state } = fixture();
    expect(
      (await service.updateSpace(1, { Title: "Shared laboratory" })).Title,
    ).toBe("Shared laboratory");
    state.denied = true;
    await expect(
      service.updateSpace(1, { AccentColor: "#ffffff" }),
    ).rejects.toThrow(/denied/i);
  });
  it("rechecks page membership before recycle and blocks retry after an uncertain deletion", async () => {
    const { service, state, fetcher } = fixture();
    state.children = [9];
    await expect(service.deleteSpace(1)).rejects.toThrow("every page");
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes("recycle")),
    ).toBe(false);
    state.children = [];
    state.failRecycle = true;
    await expect(service.deleteSpace(1)).rejects.toBeInstanceOf(
      PageDeletionError,
    );
  });
});
