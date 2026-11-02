import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
const storeKey = "metrology-confluence:demo:v1";
async function create(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  return page.getByRole("textbox", { name: "Article content", exact: true });
}

test("spaces can be renamed, recolored, and deleted safely from cards and sidebar", async ({
  page,
}) => {
  await page.goto("/");
  const card = page
    .locator(".space-card-container")
    .filter({ hasText: "Engineering" });
  await card
    .getByRole("button", { name: "Space actions for Engineering", exact: true })
    .click();
  await page.getByRole("button", { name: "Rename space", exact: true }).click();
  await page
    .getByLabel("Space name", { exact: true })
    .fill("Systems engineering");
  await page
    .getByRole("dialog", { name: "Rename space", exact: true })
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  const renamed = page
    .locator(".space-card-container")
    .filter({ hasText: "Systems engineering" });
  await renamed
    .getByLabel("Change color for Systems engineering", { exact: true })
    .click();
  await page.getByLabel("Hex color", { exact: true }).fill("#db4e91");
  await page
    .getByRole("dialog", { name: "Space color", exact: true })
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.reload();
  await expect(
    renamed.getByLabel("Change color for Systems engineering", { exact: true }),
  ).toHaveCSS("color", "rgb(219, 78, 145)");
  const sidebar = page.getByRole("complementary", {
    name: "Main navigation",
    exact: true,
  });
  await sidebar
    .getByLabel("Space actions for Systems engineering", { exact: true })
    .click();
  await page.getByRole("button", { name: "Delete space", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Delete space", exact: true })
      .getByRole("button", { name: "Delete space", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Space/ }).click();
  await page.getByLabel("Space name", { exact: true }).fill("Disposable space");
  await page.getByRole("button", { name: "Create space", exact: true }).click();
  await sidebar
    .getByLabel("Space actions for Disposable space", { exact: true })
    .click();
  await page.getByRole("button", { name: "Delete space", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete space", exact: true })
    .getByRole("button", { name: "Delete space", exact: true })
    .click();
  await expect(
    sidebar.getByLabel("Space actions for Disposable space", { exact: true }),
  ).toHaveCount(0);
});

test("page tree actions keep shared editing and creator-only deletion, including subpages", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    data.pages[0].AuthorId = 99;
    data.pages.push({
      ...data.pages[0],
      Id: 100,
      ParentPageId: data.pages[0].Id,
      AuthorId: 1,
      Title: "My nested page",
      IsPinned: false,
    });
    localStorage.setItem(key, JSON.stringify(data));
  }, storeKey);
  await page.goto("/#page=1");
  await page.reload();
  await page
    .getByLabel("Page actions for Welcome to the knowledge hub", {
      exact: true,
    })
    .click();
  const actions = page.getByRole("group", {
    name: "Page actions for Welcome to the knowledge hub",
    exact: true,
  });
  await expect(
    actions.getByRole("button", { name: "Edit page", exact: true }),
  ).toBeVisible();
  await expect(
    actions.getByRole("button", { name: "Delete page", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Page actions for My nested page", { exact: true })
    .click();
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete page", exact: true })
    .getByRole("button", { name: "Delete page", exact: true })
    .click();
  await expect(
    page.getByLabel("Page actions for My nested page", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Welcome to the knowledge hub",
      exact: true,
    }),
  ).toBeVisible();
});

test("table grid and searchable emoji insert at the cursor and survive publication", async ({
  page,
}) => {
  const content = await create(page, "Visual insert controls");
  await expect(page.locator(".workspace-topbar")).toHaveCount(0);
  await content.fill("Results");
  await content.press("End");
  await content.press("Enter");
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  await page
    .getByRole("button", { name: "7 columns by 3 rows", exact: true })
    .hover();
  await expect(
    page.getByRole("dialog", { name: "Insert table", exact: true }),
  ).toContainText("7 × 3");
  await page
    .getByRole("button", { name: "6 columns by 3 rows", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(content.locator("tr")).toHaveCount(3);
  await expect(content.locator("th")).toHaveCount(7);
  await content.press("Control+End");
  await content.press("Enter");
  await page
    .getByRole("button", { name: "Symbols & emoji", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search symbols", exact: true })
    .fill("thumbs up");
  await page.getByLabel("Emoji skin tone", { exact: true }).selectOption("🏽");
  await page
    .getByRole("button", { name: "Insert Thumbs up approve", exact: true })
    .click();
  await expect(content).toContainText("👍🏽");
  await page
    .getByRole("button", { name: "Symbols & emoji", exact: true })
    .click();
  await page.getByRole("button", { name: "Recent", exact: true }).click();
  await expect(page.locator(".rich-symbol-grid")).toContainText("👍🏽");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".article-content th")).toHaveCount(7);
  await expect(page.locator(".article-content")).toContainText("👍🏽");
});

test("save menu explains shared drafts and Update records a published revision", async ({
  page,
}) => {
  await page.goto("/#page=1");
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await page
    .getByRole("button", { name: "Page save options", exact: true })
    .click();
  const options = page.getByRole("group", {
    name: "Page save options",
    exact: true,
  });
  await expect(options).toContainText("Change this shared page to Draft");
  await expect(options).toContainText("Leave without saving");
  await options
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(page.locator(".article-header")).toContainText("Draft");
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Article content", exact: true })
    .fill("Final revised content");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.locator(".article-content")).toContainText(
    "Final revised content",
  );
  expect(
    await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem(key)!).pages.find(
          (p: { Id: number }) => p.Id === 1,
        ).VersionCount,
      storeKey,
    ),
  ).toBe(4);
});

test("template groups produce a complete calibration page and replacement asks first", async ({
  page,
}) => {
  const content = await create(page, "Calibration worksheet");
  const chooser = page.getByLabel("Starter template", { exact: true });
  await expect(chooser.locator("option")).toHaveCount(20);
  await chooser.selectOption("calibration");
  await expect(content).toContainText("References & traceability");
  await expect(content.locator("table")).toHaveCount(2);
  await chooser.selectOption("incident");
  await expect(
    page.getByRole("dialog", {
      name: "Replace the page content?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use template", exact: true }).click();
  await expect(content).toContainText("Contributing factors");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".article-content")).toContainText(
    "Contributing factors",
  );
  await page.reload();
  await expect(page.locator(".article-content")).toContainText(
    "Contributing factors",
  );
});

test("Word export downloads a DOCX with embedded images and structured content", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#207de9";
    context.fillRect(0, 0, 160, 90);
    data.pages[0].Content = `<!-- metrology-rich-text:v1 --><h2>Exported method</h2><p><strong>Required</strong> evidence</p><table><tr><th><p>Result</p></th></tr><tr><td><p>Pass</p></td></tr></table><p><img alt="Reference image" src="${canvas.toDataURL()}"></p>`;
    localStorage.setItem(key, JSON.stringify(data));
  }, storeKey);
  await page.goto("/#page=1");
  await page.reload();
  await page.getByLabel("More page actions", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export to Word", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const files = unzipSync(await readFile((await download.path())!));
  const xml = strFromU8(files["word/document.xml"]);
  expect(xml).toContain("Exported method");
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain("<w:drawing>");
  expect(
    Object.keys(files).some((name) => /^word\/media\/.+\.png$/.test(name)),
  ).toBe(true);
});

test("mobile editor retains navigation and the insert picker has one scroll area", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page, "Mobile writing");
  await expect(page.locator(".workspace-topbar")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Main navigation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Insert content", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Insert content",
    exact: true,
  });
  await expect(picker).toBeVisible();
  const geometry = await picker.evaluate((element) => ({
    outer: getComputedStyle(element).overflowY,
    inner: getComputedStyle(element.querySelector(".rich-insert-list")!)
      .overflowY,
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(geometry.outer).toBe("hidden");
  expect(geometry.inner).toBe("auto");
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
});
