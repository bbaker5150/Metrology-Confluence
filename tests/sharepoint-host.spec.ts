import { test, expect, type Page as BrowserPage } from "@playwright/test";
import { readFile } from "node:fs/promises";

const origin = "https://sharepoint-host.example.test";
const site = `${origin}/sites/metsoft`;
const appUrl = `${site}/SitePages/Metrology-Confluence.aspx`;

async function openSharePointHost(page: BrowserPage, denyCreate = false) {
  const source = await readFile("dist/index.html", "utf8");
  const html = source.replace(
    '<div id="root"></div>',
    `<script>window._spPageContextInfo={webAbsoluteUrl:${JSON.stringify(site)}};window.__hostSubmits=0;</script><form id="aspnetForm" onsubmit="window.__hostSubmits++;event.preventDefault()"><div id="root"></div></form>`,
  );
  const spaces: Record<string, unknown>[] = [];
  const creates: Record<string, unknown>[] = [];
  const unexpected: string[] = [];
  let digestRequests = 0;
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
    if (path === "/sites/metsoft/SitePages/Metrology-Confluence.aspx") {
      return route.fulfill({ contentType: "text/html", body: html });
    }
    if (path.endsWith("/_api/web/currentuser"))
      return json({ Title: "SharePoint Editor" });
    if (path.endsWith("/_api/contextinfo") && request.method() === "POST") {
      digestRequests++;
      return json({
        FormDigestValue: "test-form-digest",
        FormDigestTimeoutSeconds: 1800,
      });
    }
    const list = path.match(/\/getbytitle\('([^']+)'\)(\/items)?$/);
    if (list) {
      const [, title, items] = list;
      if (title.startsWith("KB_"))
        return json({ error: { message: "List not found" } }, 404);
      if (
        ![
          "Metrology-Confluence - Spaces",
          "Metrology-Confluence - Pages",
        ].includes(title)
      ) {
        unexpected.push(`${request.method()} ${path}`);
        return json({ error: { message: "Unexpected list" } }, 500);
      }
      if (!items)
        return json({ Id: "test-list-id", Title: title, BaseTemplate: 100 });
      if (request.method() === "GET")
        return json({ value: title.endsWith("Spaces") ? spaces : [] });
      if (request.method() === "POST" && title.endsWith("Spaces")) {
        expect(request.headers()["x-requestdigest"]).toBe("test-form-digest");
        const fields = request.postDataJSON() as Record<string, unknown>;
        creates.push(fields);
        if (denyCreate)
          return json(
            {
              error: {
                message: { value: "You do not have Add Items permission." },
              },
            },
            403,
          );
        const space = { ...fields, Id: spaces.length + 1 };
        spaces.push(space);
        return json(space, 201);
      }
    }
    unexpected.push(`${request.method()} ${path}`);
    return json({ error: { message: "Unexpected endpoint" } }, 500);
  });
  await page.goto(appUrl);
  await expect(page.locator(".profile")).toContainText("SharePoint Editor");
  await expect(
    page.getByRole("heading", {
      name: "Good work starts with shared knowledge.",
    }),
  ).toBeVisible();
  return { spaces, creates, unexpected, digestRequests: () => digestRequests };
}

async function expectNoHostSubmit(page: BrowserPage) {
  expect(
    await page.evaluate(
      () => (window as unknown as { __hostSubmits: number }).__hostSubmits,
    ),
  ).toBe(0);
  await expect(page).toHaveURL(appUrl);
}

test("creates the first SharePoint space from an ASP.NET-hosted app without submitting the host form", async ({
  page,
}) => {
  const fixture = await openSharePointHost(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await expect(page.locator("#root button:not([type])")).toHaveCount(0);
  await page.getByRole("button", { name: "New space", exact: true }).click();
  await expectNoHostSubmit(page);
  const dialog = page.getByRole("dialog", { name: "Create a space" });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((node) => node.closest("#aspnetForm") === null),
  ).toBe(true);
  await dialog
    .getByLabel("Space name", { exact: true })
    .fill("Metrology & Lab Ops");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Shared procedures and laboratory knowledge");
  await dialog
    .getByRole("button", { name: "Create space", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Metrology & Lab Ops", exact: true }),
  ).toBeVisible();
  await expectNoHostSubmit(page);
  expect(fixture.creates).toHaveLength(1);
  expect(fixture.creates[0]).toMatchObject({
    Title: "Metrology & Lab Ops",
    Description: "Shared procedures and laboratory knowledge",
    IsArchived: false,
  });
  expect(fixture.digestRequests()).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Metrology & Lab Ops", exact: true }),
  ).toBeVisible();
  expect(fixture.spaces).toHaveLength(1);
  expect(fixture.unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("SharePoint create errors remain visible and entered values survive a failed submission", async ({
  page,
}) => {
  const fixture = await openSharePointHost(page, true);
  await page.getByRole("button", { name: "Create space", exact: true }).click();
  await expectNoHostSubmit(page);
  const dialog = page.getByRole("dialog", { name: "Create a space" });
  await dialog.getByLabel("Space name", { exact: true }).fill("Engineering");
  await dialog.getByLabel("Space name", { exact: true }).press("Enter");
  await expect(dialog.getByRole("alert")).toContainText(
    "SharePoint denied access",
  );
  await expect(dialog.getByRole("alert")).toContainText("Add Items permission");
  await expect(dialog.getByLabel("Space name", { exact: true })).toHaveValue(
    "Engineering",
  );
  await expect(
    dialog.getByRole("button", { name: "Create space", exact: true }),
  ).toBeEnabled();
  expect(fixture.creates).toHaveLength(1);
  expect(fixture.spaces).toHaveLength(0);
  await expectNoHostSubmit(page);
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expectNoHostSubmit(page);
  expect(fixture.unexpected).toEqual([]);
});
