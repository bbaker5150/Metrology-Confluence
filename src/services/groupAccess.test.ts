import { describe, expect, it, vi } from "vitest";
import type { SharePointClient } from "./sharepointService";
import {
  inspectGroupAccess,
  repairGroupAccess,
  APP_USER_GROUP,
} from "./groupAccess";
import { listSchema, type ListKey } from "./schema";

type Metadata = {
  Title: string;
  BaseTemplate: number;
  HasUniqueRoleAssignments: boolean;
  ReadSecurity: number;
  WriteSecurity: number;
  DraftVersionVisibility: number;
  EnableModeration: boolean;
};
type ListState = {
  metadata: Metadata;
  grants: number[];
  otherGrants: Record<number, number[]>;
  items: { Id: number; HasUniqueRoleAssignments: boolean; grants: number[] }[];
};
const denied = () =>
  Object.assign(new Error("Permission metadata denied"), { status: 403 });
const missing = () => Object.assign(new Error("Not found"), { status: 404 });
function fixture(ready = false) {
  const roles = [
    {
      Id: 2,
      Name: "Read",
      RoleTypeKind: 2,
      BasePermissions: { Low: "1", High: "0" },
    },
    {
      Id: 3,
      Name: "Contribute",
      RoleTypeKind: 3,
      BasePermissions: { Low: "15", High: "0" },
    },
    {
      Id: 5,
      Name: "Full Control",
      RoleTypeKind: 5,
      BasePermissions: { Low: "4294967295", High: "2147483647" },
    },
  ];
  const lists = Object.fromEntries(
    (Object.keys(listSchema) as ListKey[]).map((key) => [
      key,
      {
        metadata: {
          Title: listSchema[key].title,
          BaseTemplate: 100,
          HasUniqueRoleAssignments: false,
          ReadSecurity: ready ? 1 : 2,
          WriteSecurity: ready ? 1 : 2,
          DraftVersionVisibility: ready ? 0 : 2,
          EnableModeration: true,
        },
        grants: ready ? [3] : [2],
        otherGrants: { 99: [5] },
        items:
          key === "Pages"
            ? [
                {
                  Id: 7,
                  HasUniqueRoleAssignments: true,
                  grants: ready ? [3] : [2],
                },
                { Id: 8, HasUniqueRoleAssignments: false, grants: [] },
              ]
            : [],
      },
    ]),
  ) as unknown as Record<ListKey, ListState>;
  const pathFor = (key: ListKey) =>
    `/_api/web/lists/getbytitle('${listSchema[key].title}')`;
  function stateFor(path: string) {
    const key = (Object.keys(lists) as ListKey[]).find((key) =>
      path.startsWith(pathFor(key)),
    );
    if (!key) throw new Error(`Unexpected path ${path}`);
    return lists[key];
  }
  const writes: [string, unknown, string | undefined][] = [];
  let groupExists = true;
  let actorLow = "33556480";
  let rejectPath = "";
  let rejectWrite = "";
  const get = vi.fn(async (path: string) => {
    if (rejectPath && path.includes(rejectPath)) throw denied();
    if (path.includes("sitegroups/getbyname")) {
      if (!groupExists) throw missing();
      expect(path).toBe(
        "/_api/web/sitegroups/getbyname('Metrology%20App%20User')?$select=Id,Title",
      );
      return { d: { Id: 17, Title: APP_USER_GROUP } };
    }
    if (path === "/_api/web/EffectiveBasePermissions")
      return { Low: actorLow, High: "0" };
    return { ...stateFor(path).metadata };
  });
  const collection = vi.fn(async (path: string) => {
    if (rejectPath && path.includes(rejectPath)) throw denied();
    if (path.includes("/roledefinitions?")) return roles;
    const list = stateFor(path);
    if (path.endsWith("/roleassignments?$select=PrincipalId")) {
      const itemId = path.match(/\/items\((\d+)\)/)?.[1];
      const grants = itemId
        ? list.items.find((item) => item.Id === +itemId)!.grants
        : list.grants;
      return [
        { PrincipalId: 99 },
        ...(grants.length ? [{ PrincipalId: 17 }] : []),
      ];
    }
    if (path.includes("/roledefinitionbindings?")) {
      expect(path).toContain("getbyprincipalid(17)");
      const itemId = path.match(/\/items\((\d+)\)/)?.[1];
      const grants = itemId
        ? list.items.find((item) => item.Id === +itemId)!.grants
        : list.grants;
      if (!grants.length)
        throw Object.assign(
          new Error("No role assignment for this principal"),
          {
            status: 400,
          },
        );
      return grants.map((Id) => ({ Id }));
    }
    if (path.includes("/items?"))
      return list.items.map(({ Id, HasUniqueRoleAssignments }) => ({
        Id,
        HasUniqueRoleAssignments,
      }));
    throw new Error(`Unexpected collection ${path}`);
  });
  const write = vi.fn(async (path: string, body?: unknown, method?: string) => {
    writes.push([path, body, method]);
    if (rejectWrite && path.includes(rejectWrite))
      throw new Error("Response lost");
    const list = stateFor(path);
    if (
      path.endsWith(
        "/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)",
      )
    ) {
      list.metadata.HasUniqueRoleAssignments = true;
      return;
    }
    if (path.includes("/roleassignments/addroleassignment(")) {
      expect(path).toContain("principalid=17,roledefid=3");
      const itemId = path.match(/\/items\((\d+)\)/)?.[1];
      const grants = itemId
        ? list.items.find((item) => item.Id === +itemId)!.grants
        : list.grants;
      grants.push(3);
      return;
    }
    if (method === "MERGE") {
      Object.assign(list.metadata, body);
      return;
    }
    throw new Error(`Unexpected write ${path}`);
  });
  const client = {
    get,
    collection,
    write,
    clearNames: vi.fn(),
    resolve: vi.fn(async (key: ListKey) => pathFor(key)),
  } as unknown as SharePointClient;
  return {
    client,
    lists,
    roles,
    writes,
    get,
    collection,
    write,
    missingGroup: () => {
      groupExists = false;
    },
    actorPermissions: (low: string) => {
      actorLow = low;
    },
    denyRead: (path: string) => {
      rejectPath = path;
    },
    failWrite: (path: string) => {
      rejectWrite = path;
    },
  };
}

describe("scoped team access", () => {
  it("previews creator-only list settings and unique item access without mutating anything", async () => {
    const f = fixture();
    const report = await inspectGroupAccess(f.client);
    expect(report.groupName).toBe("Metrology App User");
    expect(report.groupId).toBe(17);
    expect(report.canRepair).toBe(true);
    expect(report.ready).toBe(false);
    expect(report.lists).toHaveLength(4);
    expect(report.lists.find((list) => list.key === "Pages")).toMatchObject({
      uniqueItemCount: 1,
      uniqueItemsMissingGrant: 1,
      groupCanRead: true,
      groupCanCreate: false,
    });
    expect(report.notices.join(" ")).toContain("approval is enabled");
    expect(f.writes).toHaveLength(0);
  });
  it("requires a fresh owner check before inspecting or writing permissions", async () => {
    const f = fixture();
    await expect(
      repairGroupAccess(f.client, async () => false),
    ).rejects.toThrow("verified SharePoint site owner");
    expect(f.get).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(0);
  });
  it("detects an absent group assignment without calling the missing-principal endpoint", async () => {
    const f = fixture();
    f.lists.Pages.grants = [];
    f.lists.Pages.items[0].grants = [];
    const report = await inspectGroupAccess(f.client);
    expect(report.canRepair).toBe(true);
    expect(report.lists.find((list) => list.key === "Pages")).toMatchObject({
      groupHasContribute: false,
      uniqueItemsMissingGrant: 1,
    });
    expect(
      f.collection.mock.calls.some(
        ([path]) =>
          path.includes("Metrology-Confluence - Pages") &&
          path.includes("getbyprincipalid"),
      ),
    ).toBe(false);
    expect((await repairGroupAccess(f.client, async () => true)).ready).toBe(
      true,
    );
  });
  it("repairs only all four app lists and existing unique items while preserving owners and approval", async () => {
    const f = fixture();
    const report = await repairGroupAccess(f.client, async () => true);
    expect(report.ready).toBe(true);
    expect(
      report.lists.every(
        (list) =>
          list.groupCanRead &&
          list.groupCanCreate &&
          list.groupCanEdit &&
          list.groupCanDelete,
      ),
    ).toBe(true);
    expect(
      f.writes.filter(([path]) => path.includes("breakroleinheritance")),
    ).toHaveLength(4);
    expect(
      f.writes.filter(([path]) => path.includes("addroleassignment")),
    ).toHaveLength(5);
    expect(
      f.writes.every(([path]) =>
        path.startsWith("/_api/web/lists/getbytitle("),
      ),
    ).toBe(true);
    expect(
      f.writes.some(([path]) =>
        /resetroleinheritance|removeroleassignment|clearSubscopes=true/.test(
          path,
        ),
      ),
    ).toBe(false);
    for (const list of Object.values(f.lists)) {
      expect(list.otherGrants).toEqual({ 99: [5] });
      expect(list.grants).toEqual([2, 3]);
      expect(list.metadata).toMatchObject({
        ReadSecurity: 1,
        WriteSecurity: 1,
        DraftVersionVisibility: 0,
        EnableModeration: true,
      });
    }
    for (const [, body, method] of f.writes.filter(
      ([, , method]) => method === "MERGE",
    )) {
      expect(body).toEqual({
        ReadSecurity: 1,
        WriteSecurity: 1,
        DraftVersionVisibility: 0,
      });
      expect(method).toBe("MERGE");
    }
    const count = f.writes.length;
    await repairGroupAccess(f.client, async () => true);
    expect(f.writes).toHaveLength(count);
  });
  it("will not invent a similarly named group or write when any list inspection fails", async () => {
    const absent = fixture();
    absent.missingGroup();
    const report = await inspectGroupAccess(absent.client);
    expect(report.canRepair).toBe(false);
    expect(report.blockingIssues.join(" ")).toContain("No substitute group");
    await expect(
      repairGroupAccess(absent.client, async () => true),
    ).rejects.toThrow("not found");
    expect(absent.writes).toHaveLength(0);
    const deniedItem = fixture();
    deniedItem.denyRead("/items(7)/roleassignments");
    const blocked = await inspectGroupAccess(deniedItem.client);
    expect(blocked.ready).toBe(false);
    expect(blocked.canRepair).toBe(false);
    expect(
      blocked.lists.find((list) => list.key === "Pages")?.issues.join(" "),
    ).toContain("denied");
    await expect(
      repairGroupAccess(deniedItem.client, async () => true),
    ).rejects.toThrow("denied");
    expect(deniedItem.writes).toHaveLength(0);
  });
  it.each(["2063", "33554447", "1073741839"])(
    "does not grant a Contribute role modified with administrative mask %s",
    async (low) => {
      const f = fixture();
      f.roles[1].BasePermissions.Low = low;
      const report = await inspectGroupAccess(f.client);
      expect(report.canRepair).toBe(false);
      await expect(
        repairGroupAccess(f.client, async () => true),
      ).rejects.toThrow("administrative permissions");
      expect(f.writes).toHaveLength(0);
    },
  );
  it("does not downgrade existing higher grants or break inheritance on already-correct lists", async () => {
    const f = fixture(true);
    f.lists.Pages.grants = [5];
    f.lists.Pages.items[0].grants = [5];
    const report = await repairGroupAccess(f.client, async () => true);
    expect(report.ready).toBe(true);
    expect(report.notices.join(" ")).toContain("elevated");
    expect(f.writes).toHaveLength(0);
  });
  it("recognizes equivalent permissions combined across existing custom role bindings", async () => {
    const f = fixture(true);
    f.roles.push(
      {
        Id: 12,
        Name: "Read and add",
        RoleTypeKind: 0,
        BasePermissions: { Low: "3", High: "0" },
      },
      {
        Id: 13,
        Name: "Edit and delete",
        RoleTypeKind: 0,
        BasePermissions: { Low: "12", High: "0" },
      },
    );
    f.lists.Pages.grants = [12, 13];
    const report = await repairGroupAccess(f.client, async () => true);
    expect(report.ready).toBe(true);
    expect(f.writes).toHaveLength(0);
  });
  it("requires Manage Lists as well as owner-level Manage Permissions before repair", async () => {
    const f = fixture();
    f.actorPermissions("33554432");
    await expect(repairGroupAccess(f.client, async () => true)).rejects.toThrow(
      "Manage Permissions and Manage Lists",
    );
    expect(f.writes).toHaveLength(0);
  });
  it("stops on an uncertain write without retrying or claiming success", async () => {
    const f = fixture();
    f.failWrite("addroleassignment");
    await expect(repairGroupAccess(f.client, async () => true)).rejects.toThrow(
      "Some earlier changes may have completed",
    );
    expect(f.writes).toHaveLength(2); // One inheritance break, one grant attempt.
    expect(
      f.writes.filter(([path]) => path.includes("addroleassignment")),
    ).toHaveLength(1);
  });
  it("does not report success when read-back access is still incomplete", async () => {
    const f = fixture();
    f.write.mockImplementation(async (path, body, method) => {
      f.writes.push([path, body, method]);
    });
    await expect(repairGroupAccess(f.client, async () => true)).rejects.toThrow(
      "could not be verified",
    );
  });
  it("stops without a success result if adding a grant unexpectedly drops an existing binding", async () => {
    const f = fixture();
    const original = f.write.getMockImplementation()!;
    f.write.mockImplementation(async (path, body, method) => {
      await original(path, body, method);
      if (path.includes("/roleassignments/addroleassignment("))
        f.lists.Spaces.grants = [3];
    });
    await expect(repairGroupAccess(f.client, async () => true)).rejects.toThrow(
      "existing group role binding changed unexpectedly",
    );
    expect(f.writes).toHaveLength(2);
    expect(f.writes.some(([, , method]) => method === "MERGE")).toBe(false);
  });
});
