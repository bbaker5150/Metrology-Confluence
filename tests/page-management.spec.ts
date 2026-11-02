import { test, expect, type Page as BrowserPage } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createSeed } from "../src/data/seed";
import type { Attachment, Page, PageVersion } from "../src/types";

const localKey = "metrology-confluence:demo:v1";
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP4kAAAAASUVORK5CYII=",
  "base64",
);

async function seedLocal(page: BrowserPage, seed = createSeed()) {
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key: localKey, data: seed },
  );
}

async function readLocal(page: BrowserPage) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    localKey,
  ) as Promise<ReturnType<typeof createSeed>>;
}

async function pageAction(page: BrowserPage, action: string) {
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: action, exact: true }).click();
}

type HostPage = Omit<Page, "Tags"> & {
  Tags: string;
  "@odata.etag": string;
};

async function openDuplicateHost(page: BrowserPage) {
  const origin = "https://page-copy.example.test";
  const site = origin + "/sites/metsoft";
  const appUrl = site + "/SitePages/Metrology-Confluence.aspx";
  const attachmentUrl = (id: number, name: string) =>
    site + "/Lists/Pages/Attachments/" + id + "/" + name;
  const sourceImage = attachmentUrl(10, "reference.png");
  const sourceNotes = attachmentUrl(10, "fixture-notes.txt");
  const seed = createSeed();
  const original: HostPage = {
    ...seed.pages[1],
    Id: 10,
    Title: "Shared reference procedure",
    Content:
      '<!-- metrology-rich-text:v1 --><h2>Reference evidence</h2><p>Keep the source unchanged.</p><p><img src="' +
      sourceImage +
      '" alt="Calibration reference target"></p><p><a href="' +
      sourceNotes +
      '">Fixture notes</a></p>',
    Summary: "A source procedure with two independent attachments.",
    Tags: '["calibration","reference"]',
    AuthorId: 17,
    AuthorName: "Source Author",
    LastEditorName: "Source Author",
    IsPinned: true,
    "@odata.etag": '"1"',
  };
  const untouched = structuredClone(original);
  const pages: HostPage[] = [
    original,
    {
      ...original,
      Id: 11,
      Title: "Source child",
      ParentPageId: 10,
      IsPinned: false,
    },
  ];
  const versions: PageVersion[] = [
    {
      ...seed.versions[1],
      Id: 30,
      PageId: 10,
      TitleSnapshot: original.Title,
      ContentSnapshot: original.Content,
    },
  ];
  const comments = [
    {
      Id: 20,
      PageId: 10,
      CommentBody: "Source-only discussion",
      AuthorName: "Source Author",
      Created: original.Created,
    },
  ];
  const attachments = new Map<
    number,
    { meta: Attachment; bytes: Buffer; mime: string }[]
  >([
    [
      10,
      [
        {
          meta: {
            FileName: "reference.png",
            ServerRelativeUrl: sourceImage,
            Size: imageBytes.length,
          },
          bytes: imageBytes,
          mime: "image/png",
        },
        {
          meta: {
            FileName: "fixture-notes.txt",
            ServerRelativeUrl: sourceNotes,
            Size: 22,
          },
          bytes: Buffer.from("Keep the test fixture."),
          mime: "text/plain",
        },
      ],
    ],
  ]);
  const creates: Record<string, unknown>[] = [];
  const uploads: { pageId: number; name: string; bytes: Buffer }[] = [];
  const unexpected: string[] = [];
  const html = (await readFile("dist/index.html", "utf8")).replace(
    '<div id="root"></div>',
    "<script>window._spPageContextInfo={webAbsoluteUrl:" +
      JSON.stringify(site) +
      '};window.__hostSubmits=0;</script><form onsubmit="window.__hostSubmits++;event.preventDefault()"><div id="root"></div></form>',
  );
  await page.route(origin + "/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = decodeURIComponent(url.pathname);
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (request.url().split("#")[0] === appUrl)
      return route.fulfill({ contentType: "text/html", body: html });
    for (const files of attachments.values()) {
      const file = files.find(
        (entry) => entry.meta.ServerRelativeUrl === request.url(),
      );
      if (file)
        return route.fulfill({ contentType: file.mime, body: file.bytes });
    }
    if (path.endsWith("/_api/web/currentuser"))
      return json({ Id: 7, Title: "Current Editor", IsSiteAdmin: false });
    if (path.endsWith("/_api/web/EffectiveBasePermissions"))
      return json({ High: "0", Low: "2048" });
    if (path.endsWith("/_api/contextinfo"))
      return json({
        FormDigestValue: "copy-test-digest",
        FormDigestTimeoutSeconds: 1800,
      });
    const list = path.match(/\/getbytitle\('([^']+)'\)(.*)$/);
    if (list) {
      const [, title, suffix] = list;
      if (title.startsWith("KB_"))
        return json({ error: { message: "List not found" } }, 404);
      if (
        !/^Metrology-Confluence - (Spaces|Pages|Versions|Comments)$/.test(title)
      )
        return json({ error: { message: "Unexpected list" } }, 500);
      if (!suffix)
        return json({ Id: "list-id", Title: title, BaseTemplate: 100 });
      const files = suffix.match(
        /^\/items\((\d+)\)\/AttachmentFiles(?:\/add\(FileName='([^']+)'\))?$/,
      );
      if (files) {
        const id = Number(files[1]);
        if (request.method() === "GET")
          return json({
            value: (attachments.get(id) || []).map((entry) => entry.meta),
          });
        const name = files[2];
        expect(name).toBeTruthy();
        expect(request.headers()["x-requestdigest"]).toBe("copy-test-digest");
        const bytes = request.postDataBuffer()!;
        uploads.push({ pageId: id, name, bytes });
        const meta = {
          FileName: name,
          ServerRelativeUrl: attachmentUrl(id, name),
          Size: bytes.length,
        };
        attachments.set(id, [
          ...(attachments.get(id) || []),
          {
            meta,
            bytes,
            mime: name.endsWith(".png") ? "image/png" : "text/plain",
          },
        ]);
        const parent = pages.find((item) => item.Id === id)!;
        parent["@odata.etag"] =
          '"' + (Number(parent["@odata.etag"].replaceAll('"', "")) + 1) + '"';
        return json(meta, 201);
      }
      const item = suffix.match(/^\/items\((\d+)\)$/);
      if (item && title.endsWith("Pages")) {
        const found = pages.find((entry) => entry.Id === Number(item[1]));
        if (!found) return json({ error: { message: "Page not found" } }, 404);
        if (request.method() === "GET") return json(found);
        expect(request.headers()["x-http-method"]).toBe("MERGE");
        expect(request.headers()["if-match"]).toBe(found["@odata.etag"]);
        const payload = request.postDataJSON() as Record<string, unknown>;
        expect(payload).not.toHaveProperty("AuthorId");
        const nextEtag =
          '"' + (Number(found["@odata.etag"].replaceAll('"', "")) + 1) + '"';
        Object.assign(found, payload, { "@odata.etag": nextEtag });
        return route.fulfill({ status: 204, body: "" });
      }
      if (suffix === "/items" && request.method() === "GET") {
        if (title.endsWith("Spaces")) return json({ value: seed.spaces });
        if (title.endsWith("Pages")) return json({ value: pages });
        const pageId = Number(
          url.searchParams.get("$filter")?.match(/PageId eq (\d+)/)?.[1],
        );
        if (title.endsWith("Versions"))
          return json({
            value: versions.filter((entry) => entry.PageId === pageId),
          });
        if (title.endsWith("Comments"))
          return json({
            value: comments.filter((entry) => entry.PageId === pageId),
          });
      }
      if (suffix === "/items" && request.method() === "POST") {
        expect(request.headers()["x-requestdigest"]).toBe("copy-test-digest");
        const payload = request.postDataJSON() as Record<string, unknown>;
        if (title.endsWith("Pages")) {
          expect(payload).not.toHaveProperty("AuthorId");
          creates.push(payload);
          const created = {
            ...original,
            ...payload,
            Id: 20 + creates.length - 1,
            AuthorId: 7,
            Created: new Date().toISOString(),
            Modified: new Date().toISOString(),
            "@odata.etag": '"1"',
          } as HostPage;
          pages.push(created);
          return json(created, 201);
        }
        if (title.endsWith("Versions")) {
          const created = {
            ...payload,
            Id: 40 + versions.length,
            Created: new Date().toISOString(),
          } as unknown as PageVersion;
          versions.push(created);
          return json(created, 201);
        }
      }
    }
    unexpected.push(request.method() + " " + path);
    return json({ error: { message: "Unexpected endpoint" } }, 500);
  });
  await page.goto(appUrl + "#page=10");
  await expect(
    page.getByRole("heading", { name: original.Title, exact: true }),
  ).toBeVisible();
  return {
    pages,
    original,
    untouched,
    versions,
    comments,
    attachments,
    creates,
    uploads,
    unexpected,
    sourceImage,
    sourceNotes,
  };
}

test("duplicate creates an independent draft and copies attachments without changing the source", async ({
  page,
}) => {
  const host = await openDuplicateHost(page);
  await pageAction(page, "Duplicate page");
  const dialog = page.getByRole("dialog", {
    name: "Duplicate page",
    exact: true,
  });
  await dialog
    .getByLabel("Page title", { exact: true })
    .fill("Independent calibration draft");
  await dialog
    .getByRole("button", { name: "Create draft copy", exact: true })
    .click();
  const editor = page.getByRole("region", { name: "Edit page", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Title", { exact: true })).toHaveValue(
    "Independent calibration draft",
  );
  expect(host.creates).toHaveLength(1);
  const copy = host.pages.find((entry) => entry.Id === 20)!;
  expect(copy).toMatchObject({
    AuthorId: 7,
    AuthorName: "Current Editor",
    Status: "Draft",
    IsPinned: false,
    ParentPageId: null,
  });
  expect(copy.Content).not.toContain(host.sourceImage);
  expect(copy.Content).not.toContain(host.sourceNotes);
  expect(host.uploads.map((entry) => entry.name).sort()).toEqual([
    "fixture-notes.txt",
    "reference.png",
  ]);
  expect(
    host.uploads.find((entry) => entry.name === "reference.png")!.bytes,
  ).toEqual(imageBytes);
  expect(host.uploads.every((entry) => entry.pageId === 20)).toBe(true);
  expect(host.pages.filter((entry) => entry.ParentPageId === 20)).toHaveLength(
    0,
  );
  expect(host.comments.filter((entry) => entry.PageId === 20)).toHaveLength(0);
  expect(host.versions.filter((entry) => entry.PageId === 10)).toHaveLength(1);
  const image = editor
    .getByRole("textbox", { name: "Article content", exact: true })
    .locator("img");
  await expect(image).toHaveAttribute(
    "src",
    /\/Attachments\/20\/reference\.png$/,
  );
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect(page.locator(".article-content img")).toHaveAttribute(
    "src",
    /\/Attachments\/20\/reference\.png$/,
  );
  await expect(
    page
      .locator(".article-content")
      .getByRole("link", { name: "Fixture notes", exact: true }),
  ).toHaveAttribute("href", /\/Attachments\/20\/fixture-notes\.txt$/);
  await expect(page.locator(".attachment-card")).toHaveCount(2);
  expect(host.original).toEqual(host.untouched);
  expect(host.creates).toHaveLength(1);
  expect(
    await page.evaluate(
      () => (window as unknown as { __hostSubmits: number }).__hostSubmits,
    ),
  ).toBe(0);
  expect(host.unexpected).toEqual([]);
});

test("moving pages excludes cycles, preserves children, and relocates a leaf across spaces", async ({
  page,
}) => {
  const seed = createSeed();
  await seedLocal(page, seed);
  await page.goto("/#page=2");
  await pageAction(page, "Move page");
  let dialog = page.getByRole("dialog", { name: "Move page", exact: true });
  const destination = dialog.getByLabel("Destination space", { exact: true });
  await expect(
    destination.getByRole("option", { name: "Engineering", exact: true }),
  ).toHaveJSProperty("disabled", true);
  const parent = dialog.getByLabel("Parent page", { exact: true });
  await expect(parent.locator('option[value="2"]')).toHaveCount(0);
  await expect(parent.locator('option[value="3"]')).toHaveCount(0);
  await parent.selectOption("4");
  await dialog.getByRole("button", { name: "Move page", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  let stored = await readLocal(page);
  expect(stored.pages.find((entry) => entry.Id === 2)).toMatchObject({
    ParentPageId: 4,
    SpaceId: 1,
  });
  expect(stored.pages.find((entry) => entry.Id === 3)).toEqual(
    seed.pages.find((entry) => entry.Id === 3),
  );
  await page.goto("/#page=3");
  await pageAction(page, "Move page");
  dialog = page.getByRole("dialog", { name: "Move page", exact: true });
  await dialog
    .getByLabel("Destination space", { exact: true })
    .selectOption("2");
  await dialog.getByLabel("Parent page", { exact: true }).selectOption("5");
  await dialog.getByRole("button", { name: "Move page", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb", exact: true }),
  ).toContainText("Engineering");
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb", exact: true }),
  ).toContainText("Knowledge hub architecture");
  stored = await readLocal(page);
  expect(stored.pages.find((entry) => entry.Id === 3)).toMatchObject({
    SpaceId: 2,
    ParentPageId: 5,
    Content: seed.pages[2].Content,
  });
});

test("archiving protects active children and a leaf can be restored from Archived pages", async ({
  page,
}) => {
  await seedLocal(page);
  await page.goto("/#page=2");
  await pageAction(page, "Archive page");
  let dialog = page.getByRole("dialog", { name: "Archive page", exact: true });
  await expect(
    dialog.getByRole("button", { name: "Archive page", exact: true }),
  ).toBeDisabled();
  await expect(dialog).toContainText("active child");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.goto("/#page=4");
  await pageAction(page, "Archive page");
  dialog = page.getByRole("dialog", { name: "Archive page", exact: true });
  await dialog
    .getByRole("button", { name: "Archive page", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".article-header .status-badge")).toHaveText(
    "Archived",
  );
  await expect(
    page.getByRole("button", { name: "Edit page", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Upload attachments", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Add a comment", { exact: true }),
  ).not.toBeEditable();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", {
    name: "Search knowledge",
    exact: true,
  });
  await search.getByRole("searchbox").fill("Troubleshooting unexpected drift");
  await expect(search.locator(".search-result")).toHaveCount(0);
  await search
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("Archived");
  await expect(search.locator(".search-result")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await pageAction(page, "Save for later");
  await page
    .getByRole("button", { name: "Saved for later", exact: true })
    .click();
  await expect(
    page
      .locator(".document-row")
      .filter({ hasText: "Troubleshooting unexpected drift" })
      .locator(".status-badge"),
  ).toHaveText("Archived");
  await page
    .getByRole("button", { name: "Recently updated", exact: true })
    .click();
  await expect(
    page
      .locator(".document-row")
      .filter({ hasText: "Troubleshooting unexpected drift" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Archived pages", exact: true })
    .click();
  const archivedRow = page
    .locator(".document-row")
    .filter({ hasText: "Troubleshooting unexpected drift" });
  await expect(archivedRow).toBeVisible();
  await archivedRow.click();
  await pageAction(page, "Restore archived page");
  dialog = page.getByRole("dialog", {
    name: "Restore archived page",
    exact: true,
  });
  await dialog
    .getByLabel("Restore as", { exact: true })
    .selectOption("Published");
  await dialog
    .getByRole("button", { name: "Restore page", exact: true })
    .click();
  await expect(page.locator(".article-header .status-badge")).toHaveText(
    "Published",
  );
  await page.reload();
  const restored = (await readLocal(page)).pages.find(
    (entry) => entry.Id === 4,
  )!;
  expect(restored.Status).toBe("Published");
  expect(restored.VersionCount).toBe(3);
  await page
    .getByRole("button", { name: "Archived pages", exact: true })
    .click();
  await expect(page.locator(".document-row")).toHaveCount(0);
});

test("Save for later persists personally without pinning or revising the shared page", async ({
  page,
}) => {
  await seedLocal(page);
  await page.goto("/#page=4");
  const before = await readLocal(page);
  await pageAction(page, "Save for later");
  await page
    .getByRole("button", { name: "Saved for later", exact: true })
    .click();
  const row = page
    .locator(".document-row")
    .filter({ hasText: "Troubleshooting unexpected drift" });
  await expect(row).toBeVisible();
  await expect(
    page.getByText("Your personal reading list, saved in this browser.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await readLocal(page)).toEqual(before);
  await page.reload();
  await page
    .getByRole("button", { name: "Saved for later", exact: true })
    .click();
  await expect(row).toBeVisible();
  await row.click();
  await pageAction(page, "Remove from saved pages");
  await page
    .getByRole("button", { name: "Saved for later", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Pinned pages", exact: true }).click();
  await expect(
    page
      .locator(".document-row")
      .filter({ hasText: "Measurement readiness checklist" }),
  ).toBeVisible();
  await expect(row).toHaveCount(0);
  expect(await readLocal(page)).toEqual(before);
});

test("connected pages distinguish children, incoming links, and outgoing links", async ({
  page,
}) => {
  const seed = createSeed();
  seed.pages[1].Content =
    '<!-- metrology-rich-text:v1 --><p><a href="#page=4">Troubleshooting reference</a></p>';
  seed.pages[2].Content = "[Checklist](#page=2) is the parent procedure.";
  seed.pages[4].Content = "[External lookalike](https://example.org/#page=2)";
  seed.pages[5].Content = "[Archived mention](#page=2)";
  seed.pages[5].Status = "Archived";
  await seedLocal(page, seed);
  await page.goto("/#page=2");
  const connected = page.getByRole("region", {
    name: "Connected pages",
    exact: true,
  });
  await connected
    .getByRole("tab", { name: "Child pages", exact: true })
    .click();
  await expect(connected).toContainText("Documenting an uncertainty budget");
  await connected
    .getByRole("tab", { name: "Links to this page", exact: true })
    .click();
  await expect(connected).toContainText("Documenting an uncertainty budget");
  await expect(connected).not.toContainText("Knowledge hub architecture");
  await expect(connected).not.toContainText("Pilot rollout");
  await connected
    .getByRole("tab", { name: "Links from this page", exact: true })
    .click();
  await expect(connected).toContainText("Troubleshooting unexpected drift");
  await connected
    .getByRole("button", { name: /Troubleshooting unexpected drift/ })
    .click();
  await expect(page).toHaveURL(/#page=4$/);
  await expect(
    page.getByRole("heading", {
      name: "Troubleshooting unexpected drift",
      exact: true,
    }),
  ).toBeVisible();
});

test("revision comparison and restore work inside a sandbox without native dialogs or forms", async ({
  page,
}) => {
  const seed = createSeed();
  const current = seed.pages[3];
  current.Title = "Current review procedure";
  current.Content =
    "## Procedure\n\nKeep this context.\n\nNew approved instruction.";
  current.VersionCount = 2;
  current.etag = '"2"';
  seed.versions = seed.versions
    .filter((version) => version.PageId !== current.Id)
    .concat([
      {
        Id: 40,
        PageId: current.Id,
        VersionNumber: 1,
        TitleSnapshot: "Original review procedure",
        ContentSnapshot:
          "## Procedure\n\nKeep this context.\n\nOld instruction.",
        ChangeNote: "Original draft",
        EditedBy: "Demo Editor",
        Created: current.Created,
      },
      {
        Id: 41,
        PageId: current.Id,
        VersionNumber: 2,
        TitleSnapshot: current.Title,
        ContentSnapshot: current.Content,
        ChangeNote: "Approved revision",
        EditedBy: "Demo Editor",
        Created: current.Modified,
      },
    ]);
  await seedLocal(page, seed);
  const nativeDialogs: string[] = [];
  const blockedSubmissions: string[] = [];
  page.on("dialog", async (dialog) => {
    nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });
  page.on("console", (message) => {
    if (
      /blocked form submission|ignored call to.*confirm/i.test(message.text())
    )
      blockedSubmissions.push(message.text());
  });
  await page.route("**/__revision-sandbox__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<iframe id="knowledge-app" title="Knowledge application" sandbox="allow-scripts allow-same-origin" src="/#page=4" style="width:100%;height:100vh;border:0"></iframe>',
    }),
  );
  await page.goto("/__revision-sandbox__");
  const app = page.frameLocator("#knowledge-app");
  await app.getByLabel("More page actions", { exact: true }).click();
  await app
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  const history = app.getByRole("dialog", {
    name: "Version history",
    exact: true,
  });
  await history.getByRole("button", { name: /Version 1/ }).click();
  await history
    .getByRole("tab", { name: "Compare changes", exact: true })
    .click();
  await expect(history.locator(".revision-title-change del")).toHaveText(
    "Original review procedure",
  );
  await expect(history.locator(".revision-title-change ins")).toHaveText(
    "Current review procedure",
  );
  await expect(history.locator(".revision-diff-row.removed")).toContainText([
    "Old instruction.",
  ]);
  await expect(history.locator(".revision-diff-row.added")).toContainText([
    "New approved instruction.",
  ]);
  await history.getByLabel("Compare with", { exact: true }).selectOption("40");
  await expect(
    history.getByText("The article text is identical in these revisions.", {
      exact: true,
    }),
  ).toBeVisible();
  await history.getByLabel("Compare with", { exact: true }).selectOption("41");
  await expect(history.locator(".revision-diff-row.added")).toContainText([
    "New approved instruction.",
  ]);
  await history.getByRole("tab", { name: "Preview", exact: true }).click();
  await history.getByRole("button", { name: "Restore", exact: true }).click();
  const confirmation = history.getByLabel("Confirm version restore", {
    exact: true,
  });
  await confirmation
    .getByRole("button", { name: "Restore version", exact: true })
    .click();
  await expect(history).toHaveCount(0);
  await expect(
    app.getByRole("heading", {
      name: "Original review procedure",
      exact: true,
    }),
  ).toBeVisible();
  await expect(app.locator(".article-content")).toContainText(
    "Old instruction.",
  );
  const stored = await readLocal(page);
  expect(stored.pages.find((entry) => entry.Id === 4)).toMatchObject({
    Title: "Original review procedure",
    VersionCount: 3,
  });
  expect(stored.versions.filter((entry) => entry.PageId === 4)).toHaveLength(3);
  expect(nativeDialogs).toEqual([]);
  expect(blockedSubmissions).toEqual([]);
});

test("a page with a missing parent can be repaired by moving it to the space root", async ({
  page,
}) => {
  const seed = createSeed();
  seed.pages.find((entry) => entry.Id === 4)!.ParentPageId = 9876;
  await seedLocal(page, seed);
  await page.goto("/#page=4");
  await pageAction(page, "Move page");
  const dialog = page.getByRole("dialog", { name: "Move page", exact: true });
  await expect(dialog.getByLabel("Parent page", { exact: true })).toHaveValue(
    "",
  );
  const move = dialog.getByRole("button", { name: "Move page", exact: true });
  await expect(move).toBeEnabled();
  await move.click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await readLocal(page)).pages.find((entry) => entry.Id === 4)!.ParentPageId,
  ).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Troubleshooting unexpected drift",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .locator(".workspace-spaces .tree-title")
      .filter({ hasText: "Troubleshooting unexpected drift" }),
  ).toBeVisible();
});
