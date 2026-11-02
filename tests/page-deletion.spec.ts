import { test, expect, type Page as BrowserPage } from "@playwright/test";
import { readFile } from "node:fs/promises";

const origin = "https://page-ownership.example.test";
const site = `${origin}/sites/metsoft`;
const appUrl = `${site}/SitePages/Metrology-Confluence.aspx`;

async function openPageHost(
  page: BrowserPage,
  { userId = 7, isSiteAdmin = false, withChild = false } = {},
) {
  const source = await readFile("dist/index.html", "utf8");
  const html = source.replace(
    '<div id="root"></div>',
    `<script>window._spPageContextInfo={webAbsoluteUrl:${JSON.stringify(site)}};</script><div id="root"></div>`,
  );
  const space = {
    Id: 1,
    Title: "Engineering",
    Slug: "engineering",
    Description: "Shared team knowledge",
    IconName: "FolderOpen",
    AccentColor: "#2181f4",
    SortOrder: 1,
    IsArchived: false,
  };
  const original = {
    Id: 10,
    Title: "Shared calibration procedure",
    SpaceId: 1,
    ParentPageId: null as number | null,
    Content:
      "## Procedure\n\nA procedure everyone on the team can read and edit.",
    Summary: "Shared calibration guidance.",
    Tags: '["calibration"]',
    Status: "Published",
    IsPinned: false,
    TemplateType: "blank",
    VersionCount: 1,
    AuthorId: 7,
    AuthorName: "Shared display name",
    LastEditorName: "Shared display name",
    Created: "2026-10-30T10:00:00Z",
    Modified: "2026-10-30T10:00:00Z",
    "@odata.etag": '"1"',
  };
  const pages = [original];
  if (withChild)
    pages.push({
      ...original,
      Id: 11,
      Title: "Archived child procedure",
      ParentPageId: 10,
      Status: "Archived",
      AuthorId: 29,
    });
  const recycled: number[] = [];
  const pageSaves: Record<string, unknown>[] = [];
  const versionSaves: Record<string, unknown>[] = [];
  const unexpected: string[] = [];
  let creatorReads = 0;
  let nextId = 12;
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
    if (path.endsWith("/SitePages/Metrology-Confluence.aspx"))
      return route.fulfill({ contentType: "text/html", body: html });
    if (path.endsWith("/_api/web/currentuser"))
      return json({
        Id: userId,
        Title: "Shared display name",
        IsSiteAdmin: isSiteAdmin,
      });
    if (path.endsWith("/_api/web/EffectiveBasePermissions"))
      return json({ High: "0", Low: "2048" });
    if (path.endsWith("/_api/contextinfo") && request.method() === "POST")
      return json({
        FormDigestValue: "ownership-test-digest",
        FormDigestTimeoutSeconds: 1800,
      });
    const list = path.match(/\/getbytitle\('([^']+)'\)(.*)$/);
    if (list) {
      const [, title, suffix] = list;
      if (title.startsWith("KB_"))
        return json({ error: { message: "List not found" } }, 404);
      if (
        !/^Metrology-Confluence - (Spaces|Pages|Versions|Comments)$/.test(title)
      ) {
        unexpected.push(`${request.method()} ${path}`);
        return json({ error: { message: "Unexpected list" } }, 500);
      }
      if (!suffix)
        return json({ Id: "list-id", Title: title, BaseTemplate: 100 });
      if (/\/AttachmentFiles$/.test(suffix)) return json({ value: [] });
      const recycle = suffix.match(/^\/items\((\d+)\)\/recycle\(\)$/);
      if (recycle && request.method() === "POST") {
        expect(title).toBe("Metrology-Confluence - Pages");
        expect(request.headers()["x-requestdigest"]).toBe(
          "ownership-test-digest",
        );
        expect(request.headers()["x-http-method"]).toBeUndefined();
        const id = Number(recycle[1]);
        recycled.push(id);
        const index = pages.findIndex((item) => item.Id === id);
        if (index >= 0) pages.splice(index, 1);
        return json({ value: "f55f532d-b54f-4f1e-8d5f-fb198415d707" });
      }
      const item = suffix.match(/^\/items\((\d+)\)$/);
      if (item) {
        const found = pages.find((entry) => entry.Id === Number(item[1]));
        if (!found) return json({ error: { message: "Item not found" } }, 404);
        if (request.method() === "GET") {
          if (url.searchParams.get("$select") === "Id,AuthorId") creatorReads++;
          return json(found);
        }
        if (
          request.method() === "POST" &&
          request.headers()["x-http-method"] === "MERGE"
        ) {
          const payload = request.postDataJSON() as Record<string, unknown>;
          expect(payload).not.toHaveProperty("AuthorId");
          pageSaves.push(payload);
          Object.assign(found, payload, {
            "@odata.etag": `"${found.VersionCount + 1}"`,
          });
          return route.fulfill({ status: 204, body: "" });
        }
      }
      if (suffix === "/items" && request.method() === "GET") {
        if (title.endsWith("Spaces")) return json({ value: [space] });
        if (title.endsWith("Pages")) {
          const parent = url.searchParams
            .get("$filter")
            ?.match(/^ParentPageId eq (\d+)$/);
          return json({
            value: parent
              ? pages.filter(
                  (entry) => entry.ParentPageId === Number(parent[1]),
                )
              : pages,
          });
        }
        return json({ value: [] });
      }
      if (suffix === "/items" && request.method() === "POST") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        expect(request.headers()["x-requestdigest"]).toBe(
          "ownership-test-digest",
        );
        if (title.endsWith("Versions")) {
          versionSaves.push(payload);
          return json({ ...payload, Id: versionSaves.length }, 201);
        }
        if (title.endsWith("Pages")) {
          expect(payload).not.toHaveProperty("AuthorId");
          pageSaves.push(payload);
          const created = {
            ...original,
            ...payload,
            Id: nextId++,
            AuthorId: userId,
          };
          pages.push(created);
          return json(created, 201);
        }
      }
    }
    unexpected.push(`${request.method()} ${path}`);
    return json({ error: { message: "Unexpected endpoint" } }, 500);
  });
  await page.goto(`${appUrl}#page=10`);
  await expect(
    page.getByRole("heading", { name: original.Title, exact: true }),
  ).toBeVisible();
  await expect.poll(() => creatorReads).toBeGreaterThan(0);
  return { pages, recycled, pageSaves, versionSaves, unexpected, original };
}

async function openDeleteDialog(page: BrowserPage) {
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  return page.getByRole("dialog", { name: "Delete page", exact: true });
}

test("the native page creator can cancel then recycle a page exactly once without deleting related records", async ({
  page,
}) => {
  const fixture = await openPageHost(page);
  const dialog = await openDeleteDialog(page);
  await expect(dialog).toContainText("SharePoint recycle bin");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(fixture.recycled).toEqual([]);
  await expect(
    page.getByRole("heading", {
      name: "Shared calibration procedure",
      exact: true,
    }),
  ).toBeVisible();
  const confirmation = await openDeleteDialog(page);
  await confirmation
    .getByRole("button", { name: "Delete page", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Engineering", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Page moved to the SharePoint recycle bin.",
  );
  await expect(
    page.getByRole("heading", {
      name: "Shared calibration procedure",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(appUrl);
  expect(fixture.recycled).toEqual([10]);
  expect(fixture.pages).toHaveLength(0);
  expect(fixture.pageSaves).toEqual([]);
  expect(fixture.versionSaves).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test("a member with the creator's display name can read, edit, and create pages but cannot delete another user's page", async ({
  page,
}) => {
  const fixture = await openPageHost(page, { userId: 29 });
  await page.getByLabel("More page actions", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete page", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  const editor = page.getByRole("region", { name: "Edit page", exact: true });
  await editor
    .getByRole("textbox", { name: "Article content" })
    .fill("Updated collaboratively by another team member.");
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.locator(".article-content")).toContainText(
    "Updated collaboratively by another team member.",
  );
  expect(fixture.original.AuthorId).toBe(7);
  expect(fixture.pageSaves).toHaveLength(1);
  expect(fixture.versionSaves).toHaveLength(1);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  const create = page.getByRole("region", { name: "Create page", exact: true });
  await create
    .getByLabel("Title", { exact: true })
    .fill("A member's new procedure");
  await create
    .getByRole("textbox", { name: "Article content" })
    .fill("A new shared procedure.");
  await create
    .getByRole("button", { name: "Publish page", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "A member's new procedure",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("More page actions", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete page", exact: true }),
  ).toBeVisible();
  expect(fixture.pages).toHaveLength(2);
  expect(
    fixture.pages.find((entry) => entry.Title === "A member's new procedure")
      ?.AuthorId,
  ).toBe(29);
  expect(fixture.recycled).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test("a site owner who did not create the page cannot see Delete page", async ({
  page,
}) => {
  const fixture = await openPageHost(page, { userId: 99, isSiteAdmin: true });
  await expect(
    page.getByRole("button", { name: "Workspace settings", exact: true }),
  ).toBeVisible();
  await page.getByLabel("More page actions", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete page", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit page", exact: true }),
  ).toBeEnabled();
  expect(fixture.recycled).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test("an archived child authored by someone else blocks deleting its parent", async ({
  page,
}) => {
  const fixture = await openPageHost(page, { withChild: true });
  const dialog = await openDeleteDialog(page);
  await expect(dialog.getByRole("status")).toContainText(
    "Move or delete its 1 child page first",
  );
  await expect(
    dialog.getByRole("button", { name: "Delete page", exact: true }),
  ).toBeDisabled();
  expect(fixture.recycled).toEqual([]);
  expect(fixture.pages).toHaveLength(2);
  expect(fixture.unexpected).toEqual([]);
});

test("delete rechecks native ownership after the confirmation opens", async ({
  page,
}) => {
  const fixture = await openPageHost(page);
  const dialog = await openDeleteDialog(page);
  fixture.original.AuthorId = 29;
  await dialog
    .getByRole("button", { name: "Delete page", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Only the original creator can delete this page.",
  );
  await expect(
    page.getByRole("heading", {
      name: "Shared calibration procedure",
      exact: true,
    }),
  ).toBeVisible();
  expect(fixture.recycled).toEqual([]);
  expect(fixture.pages).toHaveLength(1);
  expect(fixture.unexpected).toEqual([]);
});
