import { test, expect, type Page as BrowserPage } from "@playwright/test";
import { readFile } from "node:fs/promises";

const origin = "https://blob-sharepoint.example.test";
const site = `${origin}/sites/metsoft`;
async function openBlobHost(
  page: BrowserPage,
  {
    opaque = true,
    blockHistory = false,
    denyDelete = false,
    linkedContent = "",
  } = {},
) {
  const source = await readFile("dist/index.html", "utf8");
  const blocking = blockHistory
    ? `History.prototype.pushState = History.prototype.replaceState = function () { throw new DOMException("History is blocked by this host", "SecurityError"); };`
    : "";
  const html = source.replace(
    '<div id="root"></div>',
    `<script>window._spPageContextInfo={webAbsoluteUrl:${JSON.stringify(site)}};${blocking}</script><div id="root"></div>`,
  );
  const spaces = [
    {
      Id: 1,
      Title: "Engineering",
      Slug: "engineering",
      Description: "Reference pages",
      IconName: "FolderOpen",
      AccentColor: "#207de9",
      SortOrder: 1,
      IsArchived: false,
    },
    {
      Id: 2,
      Title: "Empty test space",
      Slug: "test",
      Description: "",
      IconName: "FolderOpen",
      AccentColor: "#22a885",
      SortOrder: 2,
      IsArchived: false,
    },
  ];
  const pages = [
    {
      Id: 10,
      Title: "Calibration reference",
      SpaceId: 1,
      ParentPageId: null,
      Content: "## Procedure\n\nKeep the reference record.",
      Summary: "Shared reference",
      Tags: "[]",
      Status: "Published",
      IsPinned: false,
      TemplateType: "blank",
      VersionCount: 1,
      AuthorId: 7,
      AuthorName: "Lab member",
      LastEditorName: "Lab member",
      Created: "2026-11-01T00:00:00Z",
      Modified: "2026-11-01T00:00:00Z",
      "@odata.etag": '"1"',
    },
  ];
  if (linkedContent) {
    pages[0].Content = linkedContent;
    pages.push({
      ...pages[0],
      Id: 12,
      Title: "Linked procedure",
      Content: "## Evidence\n\nVerified reference.",
    });
  }
  const recycled: string[] = [],
    unexpected: string[] = [],
    errors: string[] = [];
  const versions: Record<string, unknown>[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${origin}/**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = decodeURIComponent(url.pathname);
    const headers = {
      "access-control-allow-origin": request.headers().origin || origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers":
        "accept, content-type, x-requestdigest, x-http-method, if-match",
    };
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        headers,
        contentType: "application/json",
        body: status === 204 ? "" : JSON.stringify(body),
      });
    if (request.method() === "OPTIONS") return json(null, 204);
    if (path.endsWith("/Host.aspx"))
      return route.fulfill({
        contentType: "text/html",
        body: '<html><body style="margin:0"></body></html>',
      });
    if (path.endsWith("/currentuser"))
      return json({ Id: 7, Title: "Lab member", IsSiteAdmin: false });
    if (path.endsWith("/EffectiveBasePermissions"))
      return json({ Low: "2048", High: "0" });
    if (path.endsWith("/contextinfo"))
      return json({
        FormDigestValue: "blob-digest",
        FormDigestTimeoutSeconds: 1800,
      });
    if (path.includes("getbytitle('KB_"))
      return json({ error: { message: "List not found" } }, 404);
    const match = path.match(
      /getbytitle\('Metrology-Confluence - (Spaces|Pages|Versions|Comments)'\)(.*)$/,
    );
    if (match) {
      const [, list, suffix] = match;
      if (!suffix) return json({ Id: list, BaseTemplate: 100 });
      if (suffix.endsWith("/AttachmentFiles")) return json({ value: [] });
      const recycle = suffix.match(/^\/items\((\d+)\)\/recycle\(\)$/);
      if (recycle && request.method() === "POST") {
        expect(request.headers()["x-requestdigest"]).toBe("blob-digest");
        if (denyDelete)
          return json({ error: { message: "Delete permission denied" } }, 403);
        const id = Number(recycle[1]);
        recycled.push(`${list}:${id}`);
        if (list === "Spaces")
          spaces.splice(
            spaces.findIndex((s) => s.Id === id),
            1,
          );
        else
          pages.splice(
            pages.findIndex((p) => p.Id === id),
            1,
          );
        return json({ value: "recycle-id" });
      }
      const item = suffix.match(/^\/items\((\d+)\)$/);
      if (item && list === "Pages") {
        const found = pages.find((p) => p.Id === Number(item[1]));
        if (!found) return json({ error: { message: "Item not found" } }, 404);
        if (request.method() === "POST") {
          expect(request.headers()["x-requestdigest"]).toBe("blob-digest");
          Object.assign(found, request.postDataJSON());
          found["@odata.etag"] = `"${found.VersionCount}"`;
          return json(null, 204);
        }
        return json(found);
      }
      if (suffix === "/items") {
        if (request.method() === "GET") {
          if (list === "Spaces") return json({ value: spaces });
          if (list === "Pages") {
            const filter = url.searchParams.get("$filter") || "",
              parent = filter.match(/ParentPageId eq (\d+)/),
              space = filter.match(/SpaceId eq (\d+)/);
            return json({
              value: parent
                ? pages.filter((p) => p.ParentPageId === Number(parent[1]))
                : space
                  ? pages.filter((p) => p.SpaceId === Number(space[1]))
                  : pages,
            });
          }
          return json({ value: list === "Versions" ? versions : [] });
        }
        expect(request.headers()["x-requestdigest"]).toBe("blob-digest");
        const fields = request.postDataJSON();
        if (list === "Spaces") {
          const created = { ...spaces[0], ...fields, Id: 3 };
          spaces.push(created);
          return json(created, 201);
        }
        if (list === "Pages") {
          const created = { ...pages[0], ...fields, Id: 11, AuthorId: 7 };
          pages.push(created);
          return json(created, 201);
        }
        if (list === "Versions") {
          const created = { ...fields, Id: versions.length + 1 };
          versions.push(created);
          return json(created, 201);
        }
      }
    }
    unexpected.push(`${request.method()} ${path}`);
    return json({ error: { message: "Unexpected test endpoint" } }, 500);
  });
  await page.goto(`${site}/SitePages/Host.aspx`);
  await page.evaluate(
    ({ html, opaque }) => {
      const frame = document.createElement("iframe");
      frame.id = "knowledge-app";
      frame.name = "knowledge-app";
      frame.setAttribute(
        "sandbox",
        opaque ? "allow-scripts" : "allow-scripts allow-same-origin",
      );
      frame.style.cssText = "width:100%;height:100vh;border:0";
      frame.src = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      document.body.append(frame);
    },
    { html, opaque },
  );
  const app = page.frameLocator("#knowledge-app");
  await expect(
    app.getByRole("heading", { name: "Knowledge home", exact: true }),
  ).toBeVisible();
  const frame = page.frame("knowledge-app")!;
  const initialUrl = frame.url();
  expect(initialUrl).toMatch(
    /^blob:https:\/\/blob-sharepoint\.example\.test\//,
  );
  expect(await frame.evaluate(() => window.origin)).toBe(
    opaque ? "null" : origin,
  );
  return {
    app,
    frame,
    initialUrl,
    spaces,
    pages,
    recycled,
    versions,
    unexpected,
    errors,
  };
}

for (const opaque of [false, true]) {
  test(`space deletion completes once in a real blob host (opaque origin=${opaque})`, async ({
    page,
  }) => {
    const f = await openBlobHost(page, { opaque });
    await f.app
      .locator(".space-card-container")
      .filter({ hasText: "Empty test space" })
      .getByLabel("Space actions for Empty test space", { exact: true })
      .click();
    await f.app
      .getByRole("button", { name: "Delete space", exact: true })
      .click();
    const dialog = f.app.getByRole("dialog", {
      name: "Delete space",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: "Delete space", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      f.app.getByText("Space moved to the SharePoint recycle bin.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(f.recycled).toEqual(["Spaces:2"]);
    await expect(
      f.app.getByLabel("Space actions for Empty test space", { exact: true }),
    ).toHaveCount(0);
    expect(f.frame.url()).toBe(f.initialUrl);
    await f.app
      .locator(".document-row")
      .filter({ hasText: "Calibration reference" })
      .click();
    await expect(
      f.app.getByRole("heading", {
        name: "Calibration reference",
        exact: true,
      }),
    ).toBeVisible();
    expect(f.frame.url()).toBe(`${f.initialUrl}#page=10`);
    await f.app.getByRole("button", { name: "Home", exact: true }).click();
    await expect(
      f.app.getByRole("heading", { name: "Knowledge home", exact: true }),
    ).toBeVisible();
    expect(f.frame.url()).toBe(f.initialUrl);
    expect(f.unexpected).toEqual([]);
    expect(f.errors).toEqual([]);
  });
}

test("blocked History cannot turn confirmed space/page writes into failures or bypass unsaved-edit checks", async ({
  page,
}) => {
  const f = await openBlobHost(page, { blockHistory: true });
  await f.app.getByRole("button", { name: "Create", exact: true }).click();
  await f.app.getByRole("menuitem", { name: /^Space/ }).click();
  await f.app.getByLabel("Space name", { exact: true }).fill("New lab space");
  await f.app
    .getByRole("button", { name: "Create space", exact: true })
    .click();
  await expect(
    f.app.getByRole("dialog", { name: "Create a space", exact: true }),
  ).toHaveCount(0);
  await expect(
    f.app.getByRole("heading", { name: "New lab space", exact: true }),
  ).toBeVisible();
  await f.app.getByRole("button", { name: "Create", exact: true }).click();
  await f.app.getByRole("menuitem", { name: /^Page/ }).click();
  await f.app.getByLabel("Title", { exact: true }).fill("New calibration note");
  await f.app
    .getByRole("textbox", { name: "Article content", exact: true })
    .fill("Saved procedure.");
  await f.app.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    f.app.getByRole("heading", { name: "New calibration note", exact: true }),
  ).toBeVisible();
  expect(
    f.pages.filter((p) => p.Title === "New calibration note"),
  ).toHaveLength(1);
  expect(f.versions).toHaveLength(1);
  await f.app.getByLabel("More page actions", { exact: true }).click();
  await f.app.getByRole("button", { name: "Edit page", exact: true }).click();
  await f.app.getByLabel("Title", { exact: true }).fill("Unsaved title");
  await f.app.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    f.app.getByRole("dialog", {
      name: "Discard unsaved changes?",
      exact: true,
    }),
  ).toBeVisible();
  await f.app
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(f.app.getByLabel("Title", { exact: true })).toHaveValue(
    "Unsaved title",
  );
  await f.app.getByRole("button", { name: "Update", exact: true }).click();
  await expect(
    f.app.getByRole("heading", { name: "Unsaved title", exact: true }),
  ).toBeVisible();
  expect(f.versions).toHaveLength(2);
  expect(f.frame.url()).toBe(f.initialUrl);
  await f.app.getByLabel("More page actions", { exact: true }).click();
  await f.app.getByRole("button", { name: "Delete page", exact: true }).click();
  await f.app
    .getByRole("dialog", { name: "Delete page", exact: true })
    .getByRole("button", { name: "Delete page", exact: true })
    .click();
  await expect(
    f.app.getByRole("dialog", { name: "Delete page", exact: true }),
  ).toHaveCount(0);
  expect(f.recycled).toEqual(["Pages:11"]);
  await f.app
    .getByLabel("Space actions for New lab space", { exact: true })
    .click();
  await f.app
    .getByRole("button", { name: "Delete space", exact: true })
    .click();
  await f.app
    .getByRole("dialog", { name: "Delete space", exact: true })
    .getByRole("button", { name: "Delete space", exact: true })
    .click();
  await expect(
    f.app.getByRole("dialog", { name: "Delete space", exact: true }),
  ).toHaveCount(0);
  expect(f.recycled).toEqual(["Pages:11", "Spaces:3"]);
  expect(f.unexpected).toEqual([]);
  expect(f.errors).toEqual([]);
});

test("a real SharePoint delete denial remains visible and keeps the space in a blob host", async ({
  page,
}) => {
  const f = await openBlobHost(page, { denyDelete: true });
  await f.app
    .locator(".space-card-container")
    .filter({ hasText: "Empty test space" })
    .getByLabel("Space actions for Empty test space", { exact: true })
    .click();
  await f.app
    .getByRole("button", { name: "Delete space", exact: true })
    .click();
  const dialog = f.app.getByRole("dialog", {
    name: "Delete space",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Delete space", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "SharePoint denied access",
  );
  expect(f.recycled).toEqual([]);
  expect(f.spaces).toHaveLength(2);
  expect(f.unexpected).toEqual([]);
  expect(f.errors).toEqual([]);
});

for (const rich of [false, true]) {
  test(`internal article links stay inside an opaque blob host (rich content=${rich})`, async ({
    page,
  }) => {
    const f = await openBlobHost(page, {
      blockHistory: true,
      linkedContent: rich
        ? '<!-- metrology-rich-text:v1 --><p><a href="#page=12">Open linked procedure</a></p>'
        : "[Open linked procedure](#page=12)",
    });
    await f.app
      .locator(".document-row")
      .filter({ hasText: "Calibration reference" })
      .click();
    await expect(
      f.app.getByRole("heading", {
        name: "Calibration reference",
        exact: true,
      }),
    ).toBeVisible();
    const link = f.app.getByRole("link", {
      name: "Open linked procedure",
      exact: true,
    });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(
      f.app.getByRole("heading", { name: "Linked procedure", exact: true }),
    ).toBeVisible();
    expect(f.frame.url()).toBe(f.initialUrl);
    expect(f.unexpected).toEqual([]);
    expect(f.errors).toEqual([]);
  });
}
