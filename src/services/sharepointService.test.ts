import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const { SharePointClient, KnowledgeService, detectContext } =
  await import("./sharepointService");
const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => memory.clear());
afterEach(() => vi.restoreAllMocks());

describe("SharePoint REST transport", () => {
  it("coalesces digests and attaches authenticated MERGE headers", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/contextinfo")
        ? response({
            d: {
              GetContextWebInformation: {
                FormDigestValue: "digest-value",
                FormDigestTimeoutSeconds: 1800,
              },
            },
          })
        : response(null, 204),
    );
    const client = new SharePointClient(
      "https://tenant.test/sites/lab",
      fetcher as typeof fetch,
    );
    await Promise.all([
      client.write("/_api/web/lists/items(1)", { Title: "A" }, "MERGE", '"3"'),
      client.write("/_api/web/lists/items(2)", undefined, "DELETE"),
    ]);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/contextinfo"),
      ),
    ).toHaveLength(1);
    const options = (
      fetcher.mock.calls as unknown as [string, RequestInit][]
    ).find(([url]) => url.endsWith("items(1)"))![1];
    expect(options).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        "X-RequestDigest": "digest-value",
        "X-HTTP-Method": "MERGE",
        "IF-MATCH": '"3"',
      },
    });
  });
  it("refreshes before digest expiry", async () => {
    let now = 100000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetcher = vi.fn(async () =>
      response({ FormDigestValue: "digest", FormDigestTimeoutSeconds: 120 }),
    );
    const client = new SharePointClient(
      "https://tenant.test/sites/lab",
      fetcher as typeof fetch,
    );
    await client.getDigest();
    now += 59000;
    await client.getDigest();
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 2000;
    await client.getDigest();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("reads both OData pagination formats and refuses off-site continuations", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          d: {
            results: [{ Id: 1 }],
            __next:
              "https://tenant.test/sites/lab/_api/web/lists/items?$skiptoken=2",
          },
        }),
      )
      .mockResolvedValueOnce(response({ value: [{ Id: 2 }] }));
    const client = new SharePointClient(
      "https://tenant.test/sites/lab",
      fetcher,
    );
    expect(await client.collection("/_api/web/lists/items")).toEqual([
      { Id: 1 },
      { Id: 2 },
    ]);
    fetcher.mockResolvedValueOnce(
      response({ value: [], "odata.nextLink": "https://evil.test/_api/read" }),
    );
    await expect(client.collection("/_api/web/lists/items")).rejects.toThrow(
      "outside this site API",
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects ambiguous aliases before choosing a list", async () => {
    const fetcher = vi.fn(async () =>
      response({ Id: "list", BaseTemplate: 100 }),
    );
    await expect(
      new SharePointClient(
        "https://tenant.test/sites/lab",
        fetcher as typeof fetch,
      ).resolve("Pages"),
    ).rejects.toThrow("Duplicate list aliases");
  });
  it("preserves item edit tokens by requesting metadata on reads", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("KB_Pages")) return response({}, 404);
      if (String(url).includes("/items?"))
        return response({
          value: [
            {
              Id: 1,
              Title: "Page",
              Tags: "[]",
              Content: "",
              Modified: "2026-01-01",
              "odata.etag": '"7"',
            },
          ],
        });
      return response({ Id: "list", BaseTemplate: 100 });
    });
    const service = new KnowledgeService(
      { mode: "sharepoint", webUrl: "https://tenant.test/sites/lab" },
      fetcher as typeof fetch,
    );
    expect((await service.getPages())[0].etag).toBe('"7"');
    const options = (
      fetcher.mock.calls as unknown as [string, RequestInit][]
    ).find(([url]) => url.includes("/items?"))![1];
    expect(options.headers).toEqual({
      Accept: "application/json;odata=minimalmetadata",
    });
  });
  it("preflights native Title fields before making provisioning writes", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("currentuser"))
        return response({ IsSiteAdmin: false });
      if (String(url).includes("EffectiveBasePermissions"))
        return response({ Low: "33556480" });
      if (String(url).includes("KB_")) return response({}, 404);
      if (String(url).includes("/fields?")) return response({ value: [] });
      return response({ Id: "list", BaseTemplate: 100 });
    });
    const service = new KnowledgeService(
      { mode: "sharepoint", webUrl: "https://tenant.test/sites/lab" },
      fetcher as typeof fetch,
    );
    await expect(service.provision()).rejects.toThrow(
      "native Text Title field",
    );
    expect(
      (fetcher.mock.calls as unknown as [string, RequestInit][]).every(
        ([, options]) => options.method === "GET",
      ),
    ).toBe(true);
  });
  it("does not hide production permission failures behind demo data", async () => {
    const fetcher = vi.fn(async () =>
      response({ error: { message: { value: "Denied" } } }, 403),
    );
    const service = new KnowledgeService(
      { mode: "sharepoint", webUrl: "https://tenant.test/sites/lab" },
      fetcher as typeof fetch,
    );
    await expect(service.getPages()).rejects.toThrow("denied access");
    expect(memory.size).toBe(0);
    expect(service.mode).toBe("sharepoint");
  });
  it("requires site-level Manage Lists before provisioning", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("currentuser")
        ? response({ IsSiteAdmin: true })
        : response({ Low: "0" }),
    );
    const service = new KnowledgeService(
      { mode: "sharepoint", webUrl: "https://tenant.test/sites/lab" },
      fetcher as typeof fetch,
    );
    await expect(service.provision()).rejects.toThrow("Manage Lists");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("workspace owner verification", () => {
  const context = {
    mode: "sharepoint" as const,
    webUrl: "https://tenant.test/sites/lab",
  };
  it("recognizes a site collection administrator from SharePoint", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request) =>
      response({ d: { IsSiteAdmin: true } }),
    );
    const service = new KnowledgeService(context, fetcher as typeof fetch);
    expect(await service.canManageWorkspace()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain(
      "/_api/web/currentuser?$select=IsSiteAdmin",
    );
  });
  it("recognizes effective site ownership without enumerating direct group members", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("currentuser")
        ? response({ IsSiteAdmin: false })
        : response({
            d: { EffectiveBasePermissions: { Low: "33556480", High: "0" } },
          }),
    );
    const service = new KnowledgeService(context, fetcher as typeof fetch);
    expect(await service.canManageWorkspace()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain(
      "/_api/web/EffectiveBasePermissions",
    );
  });
  it.each(["0", "1", "2048", "2049"])(
    "does not grant settings for non-owner permission mask %s",
    async (low) => {
      const fetcher = vi.fn(async (url: string | URL | Request) =>
        String(url).includes("currentuser")
          ? response({ IsSiteAdmin: false })
          : response({ Low: low }),
      );
      const service = new KnowledgeService(context, fetcher as typeof fetch);
      expect(await service.canManageWorkspace()).toBe(false);
      await expect(service.provision()).rejects.toThrow(
        "Only a verified SharePoint site owner",
      );
      expect(
        (fetcher.mock.calls as unknown as [string, RequestInit][]).every(
          ([, options]) => options.method === "GET",
        ),
      ).toBe(true);
    },
  );
  it.each([undefined, "bad", "-1", "4294967296", true])(
    "fails closed for malformed permission mask %s",
    async (low) => {
      const fetcher = vi.fn(async (url: string | URL | Request) =>
        String(url).includes("currentuser")
          ? response({ IsSiteAdmin: "true" })
          : response({ Low: low }),
      );
      expect(
        await new KnowledgeService(
          context,
          fetcher as typeof fetch,
        ).canManageWorkspace(),
      ).toBe(false);
    },
  );
  it("fails closed when owner verification is unavailable", async () => {
    const fetcher = vi.fn(async () => response({}, 403));
    const service = new KnowledgeService(context, fetcher as typeof fetch);
    expect(await service.canManageWorkspace()).toBe(false);
    expect(service.mode).toBe("sharepoint");
    await expect(service.provision()).rejects.toThrow("site owner");
    expect(memory.size).toBe(0);
  });
  it("rechecks ownership before setup after an earlier successful check", async () => {
    let low = "33556480";
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("currentuser")
        ? response({ IsSiteAdmin: false })
        : response({ Low: low }),
    );
    const service = new KnowledgeService(context, fetcher as typeof fetch);
    expect(await service.canManageWorkspace()).toBe(true);
    low = "2048";
    await expect(service.provision()).rejects.toThrow("site owner");
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(
      (fetcher.mock.calls as unknown as [string, RequestInit][]).every(
        ([, options]) => options.method === "GET",
      ),
    ).toBe(true);
  });
  it("never grants site ownership to local/demo contexts", async () => {
    const service = new KnowledgeService({ mode: "local", webUrl: "" });
    expect(await service.canManageWorkspace()).toBe(false);
    await expect(service.provision()).rejects.toThrow("site owner");
    expect(memory.size).toBe(0);
  });
});

describe("context and local persistence", () => {
  it("accepts explicit same-origin site context but rejects a foreign site", () => {
    const win = {
      location: {
        hostname: "tenant.test",
        origin: "https://tenant.test",
        href: "https://tenant.test/sites/lab/SiteAssets/hub.html",
        search: "?siteUrl=%2Fsites%2Flab",
      },
    } as Window;
    expect(detectContext(win)).toEqual({
      mode: "sharepoint",
      webUrl: "https://tenant.test/sites/lab",
    });
    win.location.search = "?siteUrl=https://other.test/sites/lab";
    expect(() => detectContext(win)).toThrow("same-origin");
  });
  it("keeps invalid context errors reviewable without falling back to local writes", async () => {
    const original = window.location;
    Object.assign(window, {
      location: {
        hostname: "tenant.test",
        origin: "https://tenant.test",
        href: "https://tenant.test/sites/lab/hub.html",
        search: "?siteUrl=https://foreign.test/",
      },
    });
    try {
      const service = new KnowledgeService();
      expect(service.mode).toBe("sharepoint");
      expect(service.initializationError?.message).toContain("same-origin");
      expect(await service.canManageWorkspace()).toBe(false);
      await expect(
        Promise.all([service.getPages(), service.currentUser()]),
      ).rejects.toThrow("same-origin");
      await expect(service.createSpace("Test", "")).rejects.toThrow(
        "same-origin",
      );
      expect(memory.size).toBe(0);
    } finally {
      Object.assign(window, { location: original });
    }
  });
  it("does not infer ownership when SharePoint page context is absent", async () => {
    const original = window.location;
    Object.assign(window, {
      location: {
        hostname: "tenant.sharepoint.com",
        origin: "https://tenant.sharepoint.com",
        href: "https://tenant.sharepoint.com/sites/lab/SiteAssets/hub.html",
        search: "",
      },
    });
    try {
      const service = new KnowledgeService();
      expect(service.mode).toBe("local");
      expect(await service.canManageWorkspace()).toBe(false);
      await expect(service.provision()).rejects.toThrow("site owner");
      expect(memory.size).toBe(0);
    } finally {
      Object.assign(window, { location: original });
    }
  });
  it("persists pages and revision restores across service instances", async () => {
    const service = new KnowledgeService({ mode: "local", webUrl: "" });
    const initial = await service.savePage(
      {
        Title: "Test procedure",
        SpaceId: 1,
        Content: "## Original",
        Status: "Draft",
        Tags: ["test"],
      },
      "First version",
    );
    const second = await service.savePage(
      { ...initial, Content: "## Edited", Status: "Published" },
      "Reviewed",
    );
    const other = new KnowledgeService({ mode: "local", webUrl: "" });
    expect(
      (await other.getPages()).find((p) => p.Id === initial.Id)?.Content,
    ).toBe("## Edited");
    const versions = await other.getVersions(initial.Id);
    expect(versions).toHaveLength(2);
    const restored = await other.restoreVersion(second, versions[1]);
    expect(restored.Content).toBe("## Original");
    expect(restored.VersionCount).toBe(3);
    expect((await other.getVersions(initial.Id))[0].ChangeNote).toBe(
      "Restored version 1",
    );
  });
  it("rejects stale edits and cyclic/cross-space parenting", async () => {
    const service = new KnowledgeService({ mode: "local", webUrl: "" });
    const parent = await service.savePage({
      Title: "Parent",
      SpaceId: 1,
      Content: "",
    });
    const child = await service.savePage({
      Title: "Child",
      SpaceId: 1,
      Content: "",
      ParentPageId: parent.Id,
    });
    await expect(
      service.savePage({ ...parent, ParentPageId: child.Id }),
    ).rejects.toThrow("cycle");
    await expect(service.savePage({ ...parent, SpaceId: 2 })).rejects.toThrow(
      "child pages",
    );
    await expect(service.savePage({ ...child, SpaceId: 2 })).rejects.toThrow(
      "same space",
    );
    await service.savePage({ ...parent, Content: "New edit" });
    await expect(
      service.savePage({ ...parent, Content: "Stale edit" }),
    ).rejects.toThrow("changed since");
    const moved = await service.savePage({ ...child, ParentPageId: null });
    expect(moved.ParentPageId).toBeNull();
  });
});
