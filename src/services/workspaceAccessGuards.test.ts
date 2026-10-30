import { beforeEach, describe, expect, it, vi } from "vitest";
const access = vi.hoisted(() => ({ inspect: vi.fn(), repair: vi.fn() }));
vi.mock("./groupAccess", () => ({
  inspectGroupAccess: access.inspect,
  repairGroupAccess: access.repair,
}));
vi.stubGlobal("window", {
  location: {
    hostname: "localhost",
    origin: "http://localhost",
    href: "http://localhost/",
    search: "",
  },
});
const { KnowledgeService, SharePointClient } =
  await import("./sharepointService");
const context = {
  mode: "sharepoint" as const,
  webUrl: "https://tenant.test/sites/lab",
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  access.inspect.mockReset();
  access.repair.mockReset();
});

describe("workspace access owner guards", () => {
  it("does not inspect or repair SharePoint access from local demo mode", async () => {
    const fetcher = vi.fn();
    const service = new KnowledgeService(
      { mode: "local", webUrl: "" },
      fetcher,
    );
    await expect(service.checkGroupAccess()).rejects.toThrow(
      "verified SharePoint site owner",
    );
    await expect(service.repairGroupAccess()).rejects.toThrow(
      "verified SharePoint site owner",
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(access.inspect).not.toHaveBeenCalled();
    expect(access.repair).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "denies members and unavailable ownership checks (failed=%s)",
    async (failed) => {
      const fetcher = vi.fn(async (url: string | URL | Request) =>
        failed
          ? response({}, 403)
          : response(
              String(url).includes("currentuser")
                ? { IsSiteAdmin: false }
                : { Low: "2048" },
            ),
      );
      const service = new KnowledgeService(context, fetcher as typeof fetch);
      await expect(service.checkGroupAccess()).rejects.toThrow(
        "verified SharePoint site owner",
      );
      await expect(service.repairGroupAccess()).rejects.toThrow(
        "verified SharePoint site owner",
      );
      expect(access.inspect).not.toHaveBeenCalled();
      expect(access.repair).not.toHaveBeenCalled();
    },
  );
  it("delegates only after verification and supplies a fresh owner check to repair", async () => {
    let owner = true;
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      response(
        String(url).includes("currentuser")
          ? { IsSiteAdmin: owner }
          : { Low: "0" },
      ),
    );
    const report = { groupName: "Metrology App User" };
    access.inspect.mockResolvedValue(report);
    access.repair.mockResolvedValue(report);
    const service = new KnowledgeService(context, fetcher as typeof fetch);
    expect(await service.checkGroupAccess()).toBe(report);
    expect(access.inspect).toHaveBeenCalledWith(expect.any(SharePointClient));
    expect(await service.repairGroupAccess()).toBe(report);
    const [client, recheck] = access.repair.mock.calls[0];
    expect(client).toBeInstanceOf(SharePointClient);
    expect(await recheck()).toBe(true);
    owner = false;
    expect(await recheck()).toBe(false);
    await expect(service.repairGroupAccess()).rejects.toThrow(
      "verified SharePoint site owner",
    );
    expect(access.repair).toHaveBeenCalledTimes(1);
  });
});
