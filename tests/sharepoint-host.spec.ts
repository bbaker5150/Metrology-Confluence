import { test, expect, type Page as BrowserPage } from "@playwright/test";
import { readFile } from "node:fs/promises";

const origin = "https://sharepoint-host.example.test";
const site = `${origin}/sites/metsoft`;
const appUrl = `${site}/SitePages/Metrology-Confluence.aspx`;
const embedUrl = `${site}/SitePages/Embedded-App.aspx`;

async function openSharePointHost(
  page: BrowserPage,
  {
    denyCreate = false,
    cancelNativeSubmit = false,
    sandboxWithoutForms = false,
  } = {},
) {
  const source = await readFile("dist/index.html", "utf8");
  // Simulate a possible host-page script that cancels a submit control's
  // browser default without stopping the app's click handler from running.
  // This fixture does not establish that the live SharePoint site does this.
  const hostClickHandler = cancelNativeSubmit
    ? `document.addEventListener('click',function(event){
        const target=event.target instanceof Element?event.target.closest('button,input'):null;
        if(target&&target.type==='submit'){
          window.__cancelledNativeSubmitClicks++;
          event.preventDefault();
        }
      },true);`
    : "";
  const html = source.replace(
    '<div id="root"></div>',
    `<script>window._spPageContextInfo={webAbsoluteUrl:${JSON.stringify(site)}};window.__hostSubmits=0;window.__cancelledNativeSubmitClicks=0;${hostClickHandler}</script><form id="aspnetForm" onsubmit="window.__hostSubmits++;event.preventDefault()"><div id="root"></div></form>`,
  );
  const spaces: Record<string, unknown>[] = [];
  const creates: Record<string, unknown>[] = [];
  const unexpected: string[] = [];
  const blockedSubmissions: string[] = [];
  page.on("console", (message) => {
    if (/blocked form submission/i.test(message.text()))
      blockedSubmissions.push(message.text());
  });
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
    if (path === "/sites/metsoft/SitePages/Embedded-App.aspx") {
      return route.fulfill({
        contentType: "text/html",
        body: `<iframe id="knowledge-app" name="knowledge-app" title="Knowledge application" sandbox="allow-scripts allow-same-origin" src="${appUrl}" style="width:100%;height:100vh;border:0"></iframe>`,
      });
    }
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
  await page.goto(sandboxWithoutForms ? embedUrl : appUrl);
  const app = sandboxWithoutForms ? page.frameLocator("#knowledge-app") : page;
  await expect(app.locator(".account-summary")).toContainText(
    "SharePoint Editor",
  );
  await expect(
    app.getByRole("heading", {
      name: "Knowledge home",
    }),
  ).toBeVisible();
  return {
    app,
    spaces,
    creates,
    unexpected,
    blockedSubmissions,
    digestRequests: () => digestRequests,
  };
}

async function expectNoHostSubmit(
  page: BrowserPage,
  sandboxWithoutForms = false,
) {
  const appWindow = sandboxWithoutForms ? page.frame("knowledge-app")! : page;
  expect(
    await appWindow.evaluate(
      () => (window as unknown as { __hostSubmits: number }).__hostSubmits,
    ),
  ).toBe(0);
  expect(appWindow.url()).toBe(appUrl);
  await expect(page).toHaveURL(sandboxWithoutForms ? embedUrl : appUrl);
}

test("creates the first SharePoint space from an ASP.NET-hosted app without submitting the host form", async ({
  page,
}) => {
  const fixture = await openSharePointHost(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await expect(page.locator("#root button:not([type])")).toHaveCount(0);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Space/ }).click();
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
  const fixture = await openSharePointHost(page, { denyCreate: true });
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Space/ }).click();
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

for (const host of [
  {
    name: "the host cancels native submit-button defaults",
    options: { cancelNativeSubmit: true },
  },
  {
    name: "the app is embedded in a sandbox without form permissions",
    options: { sandboxWithoutForms: true },
  },
]) {
  for (const action of ["click", "Enter"] as const) {
    test(`creates exactly one space with ${action} when ${host.name}`, async ({
      page,
    }) => {
      const fixture = await openSharePointHost(page, host.options);
      const app = fixture.app;
      await app.getByRole("button", { name: "Create", exact: true }).click();
      await app.getByRole("menuitem", { name: /^Space/ }).click();
      const dialog = app.getByRole("dialog", { name: "Create a space" });
      const name = dialog.getByLabel("Space name", { exact: true });
      await name.fill(`Engineering ${action}`);
      await dialog
        .getByLabel("Description", { exact: true })
        .fill("Created while native form submission is unavailable.");

      if (action === "click") {
        await dialog
          .getByRole("button", { name: "Create space", exact: true })
          .click();
      } else {
        await name.press("Enter");
      }

      await expect.poll(() => fixture.creates.length).toBe(1);
      await expect(dialog).toHaveCount(0);
      await expect(
        app.getByRole("heading", {
          name: `Engineering ${action}`,
          exact: true,
        }),
      ).toBeVisible();
      await expectNoHostSubmit(page, host.options.sandboxWithoutForms);
      expect(fixture.creates).toHaveLength(1);
      expect(fixture.spaces).toHaveLength(1);
      expect(fixture.creates[0]).toMatchObject({
        Title: `Engineering ${action}`,
        Description: "Created while native form submission is unavailable.",
        IsArchived: false,
      });
      expect(fixture.digestRequests()).toBe(1);
      expect(fixture.unexpected).toEqual([]);
      expect(fixture.blockedSubmissions).toEqual([]);
    });
  }
}

test("a blank space name shows validation without making a SharePoint create request", async ({
  page,
}) => {
  const fixture = await openSharePointHost(page, {
    cancelNativeSubmit: true,
  });
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Space/ }).click();
  const dialog = page.getByRole("dialog", { name: "Create a space" });
  await dialog.getByLabel("Space name", { exact: true }).fill("   ");
  const create = dialog.getByRole("button", {
    name: "Create space",
    exact: true,
  });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(/name/i);
  await expect(dialog).toBeVisible();
  expect(fixture.creates).toHaveLength(0);
  expect(fixture.spaces).toHaveLength(0);
  expect(fixture.digestRequests()).toBe(0);
  await expectNoHostSubmit(page);
  expect(fixture.unexpected).toEqual([]);
});

async function openLocalSandbox(page: BrowserPage, appPath = "/") {
  const blockedSubmissions: string[] = [];
  page.on("console", (message) => {
    if (/blocked form submission/i.test(message.text()))
      blockedSubmissions.push(message.text());
  });
  await page.route("**/__sandbox-test__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<iframe id="knowledge-app" name="knowledge-app" title="Knowledge application" sandbox="allow-scripts allow-same-origin" src="${appPath}" style="width:100%;height:100vh;border:0"></iframe>`,
    }),
  );
  await page.goto("/__sandbox-test__");
  return {
    app: page.frameLocator("#knowledge-app"),
    blockedSubmissions,
  };
}

test("posts a comment once in a sandbox without form permissions and keeps Enter as a newline", async ({
  page,
}) => {
  const { app, blockedSubmissions } = await openLocalSandbox(page, "/#page=1");
  await expect(
    app.getByRole("heading", {
      name: "Welcome to the knowledge hub",
      exact: true,
    }),
  ).toBeVisible();
  const comment = app.getByLabel("Add a comment", { exact: true });
  await comment.fill("Checked the measurement procedure.");
  await comment.press("Enter");
  await comment.pressSequentially("Ready for review.");
  await expect(comment).toHaveValue(
    "Checked the measurement procedure.\nReady for review.",
  );
  const postedComment = app
    .locator(".comment-feed .comment")
    .filter({ hasText: "Checked the measurement procedure." });
  await expect(postedComment).toHaveCount(0);
  await app.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(postedComment).toHaveCount(1);
  await expect(postedComment).toContainText("Ready for review.");
  await expect(comment).toHaveValue("");
  await page.reload();
  await expect(postedComment).toHaveCount(1);
  expect(blockedSubmissions).toEqual([]);
});

for (const action of ["click", "Enter"] as const) {
  test(`uses an explicit site URL with ${action} in a sandbox without form permissions`, async ({
    page,
  }) => {
    const { app, blockedSubmissions } = await openLocalSandbox(page);
    await app
      .getByRole("button", { name: "Workspace settings", exact: true })
      .click();
    const dialog = app.getByRole("dialog", { name: "Workspace settings" });
    await dialog.getByText("Connection settings", { exact: true }).click();
    const field = dialog.getByLabel("SharePoint site URL", { exact: true });
    const siteUrl = `${new URL(page.url()).origin}/sites/metsoft`;
    await field.fill(siteUrl);
    if (action === "click") {
      await dialog
        .getByRole("button", { name: "Use this site", exact: true })
        .click();
    } else {
      await field.press("Enter");
    }
    await expect
      .poll(() =>
        new URL(page.frame("knowledge-app")!.url()).searchParams.get("siteUrl"),
      )
      .toBe(siteUrl);
    await expect(
      app.getByRole("heading", { name: "Knowledge home", exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/__sandbox-test__");
    expect(blockedSubmissions).toEqual([]);
  });
}
