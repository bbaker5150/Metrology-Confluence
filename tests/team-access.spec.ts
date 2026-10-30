import { test, expect, type Page as BrowserPage } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { listSchema, type ListKey } from "../src/services/schema";

const origin = "https://team-access.example.test";
const site = `${origin}/sites/metsoft`;
const appUrl = `${site}/SitePages/Metrology-Confluence.aspx`;
const groupId = 77;
const ownerGroupId = 90;
const contributeRoleId = 3;
const keys = Object.keys(listSchema) as ListKey[];

async function openWorkspace(
  page: BrowserPage,
  { owner = true, repaired = false } = {},
) {
  const html = (await readFile("dist/index.html", "utf8")).replace(
    '<div id="root"></div>',
    `<script>window._spPageContextInfo={webAbsoluteUrl:${JSON.stringify(site)}};</script><div id="root"></div>`,
  );
  const now = "2026-10-30T12:00:00Z";
  const records: Record<ListKey, Record<string, unknown>[]> = {
    Spaces: [
      {
        Id: 1,
        Title: "Shared metrology",
        Slug: "shared",
        Description: "Team procedures",
        IconName: "BookOpen",
        AccentColor: "#207de9",
        SortOrder: 0,
        IsArchived: false,
        AuthorId: 1,
      },
    ],
    Pages: [
      {
        Id: 1,
        Title: "Owner's calibration procedure",
        SpaceId: 1,
        ParentPageId: null,
        Content: "## Procedure\n\nOriginal owner guidance.",
        Summary: "Shared reference for all app users.",
        Tags: '["calibration"]',
        Status: "Published",
        IsPinned: true,
        TemplateType: "blank",
        VersionCount: 1,
        AuthorName: "Site Owner",
        AuthorId: 1,
        LastEditorName: "Site Owner",
        Created: now,
        Modified: now,
        "odata.etag": '"1"',
        HasUniqueRoleAssignments: true,
      },
    ],
    Versions: [],
    Comments: [],
  };
  const metadata = Object.fromEntries(
    keys.map((key) => [
      key,
      {
        Id: `list-${key.toLowerCase()}`,
        Title: listSchema[key].title,
        BaseTemplate: 100,
        HasUniqueRoleAssignments: repaired,
        ReadSecurity: repaired ? 1 : 2,
        WriteSecurity: repaired ? 1 : 2,
        DraftVersionVisibility: repaired ? 0 : 2,
        EnableModeration: false,
      },
    ]),
  ) as Record<ListKey, Record<string, unknown>>;
  const grants = new Map<string, Map<number, number[]>>();
  for (const scope of [...keys, "Pages/items(1)"]) {
    grants.set(
      scope,
      new Map([
        [ownerGroupId, [5]],
        ...(repaired
          ? [[groupId, [contributeRoleId]] as [number, number[]]]
          : []),
      ]),
    );
  }
  const writes: {
    scope: string;
    operation: string;
    body?: Record<string, unknown>;
  }[] = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const canAccess = (key: ListKey, itemId?: number) => {
    if (owner) return true;
    const scope = itemId === 1 && key === "Pages" ? "Pages/items(1)" : key;
    return (
      grants.get(scope)?.get(groupId)?.includes(contributeRoleId) &&
      metadata[key].ReadSecurity === 1
    );
  };
  await page.route(`${origin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = decodeURIComponent(url.pathname);
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/sites/metsoft/SitePages/Metrology-Confluence.aspx")
      return route.fulfill({ contentType: "text/html", body: html });
    if (path.endsWith("/_api/web/currentuser"))
      return json({
        Id: owner ? 1 : 2,
        Title: owner ? "Site Owner" : "App Member",
        IsSiteAdmin: false,
      });
    if (path.endsWith("/_api/web/EffectiveBasePermissions"))
      return json({ Low: owner ? "33556480" : "0", High: "0" });
    if (path.endsWith("/_api/web/sitegroups/getbyname('Metrology App User')"))
      return owner
        ? json({ Id: groupId, Title: "Metrology App User" })
        : json(
            {
              error: { message: "Only owners inspect workspace group access." },
            },
            403,
          );
    if (path.endsWith("/_api/web/roledefinitions"))
      return json({
        value: [
          {
            Id: 2,
            Name: "Read",
            RoleTypeKind: 2,
            BasePermissions: { Low: "1", High: "0" },
          },
          {
            Id: contributeRoleId,
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
        ],
      });
    if (path.endsWith("/_api/contextinfo") && request.method() === "POST")
      return json({
        FormDigestValue: "team-access-digest",
        FormDigestTimeoutSeconds: 1800,
      });
    const match = path.match(/\/getbytitle\('([^']+)'\)(.*)$/);
    if (match) {
      const [, title, resource] = match;
      if (title.startsWith("KB_"))
        return json({ error: { message: "List not found" } }, 404);
      const key = keys.find(
        (candidate) => listSchema[candidate].title === title,
      );
      if (!key) return json({ error: { message: "Unknown list" } }, 404);
      const roleAssignments = resource.match(
        /^(\/items\((\d+)\))?\/roleassignments$/,
      );
      if (roleAssignments && request.method() === "GET") {
        const scope = `${key}${roleAssignments[1] || ""}`;
        return json({
          value: Array.from(grants.get(scope)?.keys() || []).map(
            (PrincipalId) => ({ PrincipalId }),
          ),
        });
      }
      const roleBindings = resource.match(
        /^(\/items\((\d+)\))?\/roleassignments\/getbyprincipalid\((\d+)\)\/roledefinitionbindings$/,
      );
      if (roleBindings) {
        const scope = `${key}${roleBindings[1] || ""}`;
        const roles = grants.get(scope)?.get(Number(roleBindings[3]));
        return roles
          ? json({ value: roles.map((Id) => ({ Id })) })
          : json({ error: { message: "No group assignment" } }, 404);
      }
      if (resource === "/fields")
        return json({
          value: [
            { InternalName: "Title", TypeAsString: "Text" },
            ...listSchema[key].fields.map((field) => ({
              InternalName: field.name,
              TypeAsString: field.type,
            })),
          ],
        });
      if (request.method() === "POST") {
        expect(request.headers()["x-requestdigest"]).toBe("team-access-digest");
        const body = request.postData()
          ? (request.postDataJSON() as Record<string, unknown>)
          : undefined;
        if (
          resource ===
          "/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)"
        ) {
          expect(owner).toBe(true);
          metadata[key].HasUniqueRoleAssignments = true;
          writes.push({ scope: key, operation: "break" });
          return json({});
        }
        const grant = resource.match(
          /^(\/items\((\d+)\))?\/roleassignments\/addroleassignment\(principalid=(\d+),roledefid=(\d+)\)$/,
        );
        if (grant) {
          expect(owner).toBe(true);
          const scope = `${key}${grant[1] || ""}`;
          expect(Number(grant[3])).toBe(groupId);
          expect(Number(grant[4])).toBe(contributeRoleId);
          const assignments = grants.get(scope)!;
          assignments.set(groupId, [
            ...new Set([...(assignments.get(groupId) || []), contributeRoleId]),
          ]);
          writes.push({ scope, operation: "grant" });
          return json({});
        }
        if (!resource && request.headers()["x-http-method"] === "MERGE") {
          expect(owner).toBe(true);
          Object.assign(metadata[key], body);
          writes.push({ scope: key, operation: "settings", body });
          return json({});
        }
        if (resource === "/items") {
          if (!canAccess(key))
            return json(
              { error: { message: "The app group cannot add items." } },
              403,
            );
          const Id =
            Math.max(0, ...records[key].map((item) => Number(item.Id))) + 1;
          const item = {
            ...body,
            Id,
            AuthorId: owner ? 1 : 2,
            Created: now,
            Modified: now,
            "odata.etag": '"1"',
            HasUniqueRoleAssignments: false,
          };
          records[key].push(item);
          writes.push({ scope: key, operation: "create", body });
          return json(item, 201);
        }
        const item = resource.match(/^\/items\((\d+)\)$/);
        if (item && request.headers()["x-http-method"] === "MERGE") {
          const Id = Number(item[1]);
          if (!canAccess(key, Id) || metadata[key].WriteSecurity !== 1)
            return json(
              { error: { message: "Shared editing is denied." } },
              403,
            );
          const stored = records[key].find((record) => record.Id === Id)!;
          expect(request.headers()["if-match"]).toBe(stored["odata.etag"]);
          Object.assign(stored, body, {
            Modified: now,
            "odata.etag": `"${Number(stored.VersionCount)}"`,
          });
          writes.push({
            scope: `${key}/items(${Id})`,
            operation: "edit",
            body,
          });
          return json({});
        }
      } else {
        if (!resource) return json(metadata[key]);
        if (/^\/items\(\d+\)\/AttachmentFiles$/.test(resource))
          return json({ value: [] });
        const item = resource.match(/^\/items\((\d+)\)$/);
        if (item) {
          const Id = Number(item[1]);
          if (!canAccess(key, Id))
            return json(
              { error: { message: "The app group cannot read this item." } },
              403,
            );
          return json(records[key].find((record) => record.Id === Id));
        }
        if (resource === "/items") {
          if (url.searchParams.get("$select") === "Id,HasUniqueRoleAssignments")
            return json({
              value: records[key].map((record) => ({
                Id: record.Id,
                HasUniqueRoleAssignments:
                  record.HasUniqueRoleAssignments === true,
              })),
            });
          if (!canAccess(key))
            return json(
              { error: { message: "The app group cannot read this list." } },
              403,
            );
          let selected = records[key];
          const pageFilter = url.searchParams
            .get("$filter")
            ?.match(/^PageId eq (\d+)$/);
          if (pageFilter)
            selected = selected.filter(
              (record) => record.PageId === Number(pageFilter[1]),
            );
          return json({ value: selected });
        }
      }
    }
    unexpected.push(`${request.method()} ${path}`);
    return json({ error: { message: "Unexpected test endpoint" } }, 500);
  });
  await page.goto(appUrl);
  await expect(
    page.getByRole("heading", { name: "Knowledge home", exact: true }),
  ).toBeVisible();
  return { records, metadata, grants, writes, unexpected, errors };
}

test("an owner repairs all four app lists and unique page access once, then verifies the result", async ({
  page,
}) => {
  const fixture = await openWorkspace(page);
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Workspace settings",
    exact: true,
  });
  const team = settings.getByRole("region", {
    name: "Team access",
    exact: true,
  });
  await expect(
    team.getByRole("button", { name: "Repair team access", exact: true }),
  ).toBeEnabled();
  await team
    .getByRole("button", { name: "Repair team access", exact: true })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Repair team access",
    exact: true,
  });
  await expect(confirm).toContainText("Metrology App User");
  await expect(confirm).toContainText(
    "SharePoint’s Contribute permission also allows deletion outside the app.",
  );
  await confirm
    .getByRole("button", { name: "Apply shared access", exact: true })
    .click();
  await expect(confirm).toHaveCount(0);
  await expect(team.getByRole("status")).toContainText(
    "Shared reading and editing access is ready",
  );
  await expect(
    team.getByRole("button", { name: "Team access ready", exact: true }),
  ).toBeDisabled();
  for (const key of keys) {
    expect(fixture.metadata[key]).toMatchObject({
      HasUniqueRoleAssignments: true,
      ReadSecurity: 1,
      WriteSecurity: 1,
      DraftVersionVisibility: 0,
    });
    expect(
      fixture.writes.filter(
        (write) => write.scope === key && write.operation === "break",
      ),
    ).toHaveLength(1);
    expect(
      fixture.writes.filter(
        (write) => write.scope === key && write.operation === "grant",
      ),
    ).toHaveLength(1);
    expect(
      fixture.writes.filter(
        (write) => write.scope === key && write.operation === "settings",
      ),
    ).toHaveLength(1);
    expect(fixture.grants.get(key)?.get(ownerGroupId)).toEqual([5]);
  }
  expect(
    fixture.writes.filter(
      (write) =>
        write.scope === "Pages/items(1)" && write.operation === "grant",
    ),
  ).toHaveLength(1);
  expect(fixture.grants.get("Pages/items(1)")?.get(ownerGroupId)).toEqual([5]);
  const completedWrites = fixture.writes.length;
  await team
    .getByRole("button", { name: "Check team access", exact: true })
    .click();
  await expect(
    team.getByRole("button", { name: "Check team access", exact: true }),
  ).toBeEnabled();
  await expect(
    team.getByRole("button", { name: "Team access ready", exact: true }),
  ).toBeDisabled();
  expect(fixture.writes).toHaveLength(completedWrites);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("an app-group member reads and edits an owner's page and creates a page without owner-only controls", async ({
  page,
}) => {
  const fixture = await openWorkspace(page, { owner: false, repaired: true });
  await expect(
    page.getByRole("button", { name: "Workspace settings", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Repair team access", exact: true }),
  ).toHaveCount(0);
  await page.locator(".workspace-pinned-card").click();
  await expect(
    page.getByRole("heading", {
      name: "Owner's calibration procedure",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Article content", exact: true })
    .fill("Procedure updated by a team member.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".article-content")).toContainText(
    "Procedure updated by a team member.",
  );
  expect(fixture.records.Pages[0].AuthorId).toBe(1);
  expect(fixture.records.Pages[0].LastEditorName).toBe("App Member");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  await page.getByLabel("Title", { exact: true }).fill("App member procedure");
  await page
    .getByRole("textbox", { name: "Article content", exact: true })
    .fill("New shared team knowledge.");
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "App member procedure", exact: true }),
  ).toBeVisible();
  expect(fixture.records.Pages).toHaveLength(2);
  expect(fixture.records.Pages[1].AuthorId).toBe(2);
  expect(fixture.records.Versions).toHaveLength(2);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "App member procedure", exact: true }),
  ).toBeVisible();
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});
