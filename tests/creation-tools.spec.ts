import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function createDraft(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  const editor = page.getByRole("region", { name: "Create page", exact: true });
  await editor.getByLabel("Title", { exact: true }).fill(title);
  return editor.getByRole("textbox", { name: "Article content", exact: true });
}

async function choosePageTool(page: Page, name: string) {
  await page.getByRole("button", { name: "Page tools", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("the document outline jumps to headings and preview preserves edits without saving a page", async ({
  page,
}) => {
  const content = await createDraft(page, "Preview the calibration guide");
  await content.fill("Purpose");
  await page.getByLabel("Text style", { exact: true }).selectOption("2");
  await content.press("End");
  await content.press("Enter");
  await content.pressSequentially("Describe the approved method.");
  await content.press("Enter");
  await content.pressSequentially("Procedure");
  await page.getByLabel("Text style", { exact: true }).selectOption("2");
  await content.press("End");
  await content.press("Enter");
  await content.pressSequentially("Apply the reference checks here.");
  const before = await page.evaluate(() =>
    localStorage.getItem("metrology-confluence:demo:v1"),
  );
  await choosePageTool(page, "Outline");
  const outline = page.getByLabel("Page outline", { exact: true });
  await expect(outline).toBeVisible();
  await outline.getByRole("button", { name: "Purpose", exact: true }).click();
  await expect(content).toBeFocused();
  await expect
    .poll(() =>
      content.evaluate(() => {
        const anchor = document.getSelection()?.anchorNode;
        const element =
          anchor instanceof Element ? anchor : anchor?.parentElement;
        return element?.closest("h2")?.textContent;
      }),
    )
    .toBe("Purpose");
  await choosePageTool(page, "Preview");
  const preview = page.getByRole("region", {
    name: "Page preview",
    exact: true,
  });
  await expect(preview).toBeVisible();
  await expect(
    preview.getByRole("heading", { name: "Purpose", exact: true }),
  ).toBeVisible();
  await expect(
    preview.getByRole("heading", { name: "Procedure", exact: true }),
  ).toBeVisible();
  await expect(preview).toContainText("Apply the reference checks here.");
  await expect(content).toBeHidden();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("metrology-confluence:demo:v1"),
    ),
  ).toBe(before);
  await page
    .getByRole("button", { name: "Back to writing", exact: true })
    .click();
  await expect(content).toBeVisible();
  await expect(content).toContainText("Describe the approved method.");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Preview the calibration guide",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("metrology-confluence:demo:v1"),
    ),
  ).toBe(before);
});

test("the page picker inserts a stable internal link that survives publishing and Markdown export", async ({
  page,
}) => {
  const content = await createDraft(page, "Linked procedure reference");
  await content.fill("Related guidance");
  await content.press("End");
  await content.press("Enter");
  await page.getByRole("button", { name: "Insert link", exact: true }).click();
  const link = page.getByRole("dialog", { name: "Edit link", exact: true });
  await link.getByRole("tab", { name: "Pages", exact: true }).click();
  await link
    .getByRole("textbox", { name: "Search pages", exact: true })
    .fill("Measurement readiness checklist");
  await link
    .getByRole("button", { name: /^Measurement readiness checklist/ })
    .click();
  await link.getByRole("button", { name: "Insert link", exact: true }).click();
  await expect(
    content.getByRole("link", {
      name: "Measurement readiness checklist",
      exact: true,
    }),
  ).toHaveAttribute("href", "#page=2");
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  const readerLink = page.locator(".article-content").getByRole("link", {
    name: "Measurement readiness checklist",
    exact: true,
  });
  await expect(readerLink).toHaveAttribute("href", "#page=2");
  await page.getByLabel("More page actions", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Markdown", exact: true })
    .click();
  const download = await downloaded;
  const file = await download.path();
  expect(file).toBeTruthy();
  const markdown = await readFile(file!, "utf8");
  expect(markdown).toContain("[Measurement readiness checklist](#page=2)");
  await readerLink.click();
  await expect(page).toHaveURL(/#page=2$/);
  await expect(
    page.getByRole("heading", {
      name: "Measurement readiness checklist",
      exact: true,
    }),
  ).toBeVisible();
});

test("expand sections and status labels survive publishing, search, and Markdown export", async ({
  page,
}) => {
  const content = await createDraft(page, "Trial readiness review");
  await content.fill("Release review");
  await content.press("End");
  await content.press("Enter");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Insert content", exact: true })
    .getByRole("button", { name: /^Status / })
    .click();
  const chip = content.locator('span[data-type="status"]');
  await chip.click();
  await page
    .getByRole("textbox", { name: "Status label", exact: true })
    .fill("Approved for trial");
  await page.getByLabel("Status color", { exact: true }).selectOption("green");
  await content.press("Control+End");
  await content.press("Enter");
  await expect(chip).toHaveAttribute("data-tone", "green");
  await expect(chip).toHaveText("Approved for trial");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Insert content", exact: true })
    .getByRole("button", { name: /^Expand section / })
    .click();
  const section = content.locator('details[data-type="expand"]');
  await expect(chip).toHaveText("Approved for trial");
  await section.locator(".expand-editor-title").fill("Validation notes");
  await section.locator('div[data-type="expandContent"] p').first().click();
  await page.keyboard.type("Evidence checks");
  await page.getByLabel("Text style", { exact: true }).selectOption("2");
  await content.press("End");
  await content.press("Enter");
  await page.keyboard.type("Calibration evidence verified at ");
  await page
    .getByRole("button", { name: "Bold (Ctrl+B)", exact: true })
    .click();
  await expect(content).toBeFocused();
  await page.keyboard.type("reference conditions");
  await page
    .getByRole("button", { name: "Bold (Ctrl+B)", exact: true })
    .click();
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  const readerSection = page.locator(
    ".article-content details.document-expand",
  );
  await expect(readerSection).toHaveJSProperty("open", false);
  await expect(
    page.locator(".article-content .document-status.status-green"),
  ).toHaveText("Approved for trial");
  await page
    .getByRole("complementary", { name: "On this page", exact: true })
    .getByRole("link", { name: "Evidence checks", exact: true })
    .click();
  await expect(readerSection).toHaveJSProperty("open", true);
  await expect(
    readerSection.getByRole("heading", {
      name: "Evidence checks",
      exact: true,
    }),
  ).toBeFocused();
  await expect(readerSection).toContainText(
    "Calibration evidence verified at reference conditions",
  );
  await expect(readerSection.locator("strong")).toHaveText(
    "reference conditions",
  );
  await page.reload();
  await expect(readerSection).toHaveJSProperty("open", false);
  await expect(readerSection.locator("summary")).toHaveText("Validation notes");
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", {
    name: "Search knowledge",
    exact: true,
  });
  await search.getByRole("searchbox").fill("Calibration evidence");
  await expect(search.locator(".search-result")).toHaveCount(1);
  await expect(search.locator(".search-result")).toContainText(
    "Trial readiness review",
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("More page actions", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Markdown", exact: true })
    .click();
  const file = await (await downloaded).path();
  const markdown = await readFile(file!, "utf8");
  expect(markdown).toContain("Approved for trial");
  expect(markdown).toContain("**Validation notes**");
  expect(markdown).toContain(
    "Calibration evidence verified at **reference conditions**",
  );
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  const reopened = page.getByRole("textbox", {
    name: "Article content",
    exact: true,
  });
  await expect(
    reopened.locator('details[data-type="expand"] .expand-editor-title'),
  ).toHaveText("Validation notes");
  await expect(
    reopened.locator('span[data-type="status"][data-tone="green"]'),
  ).toHaveText("Approved for trial");
});

test("Enter after a selected status keeps the label and begins a new paragraph", async ({
  page,
}) => {
  const content = await createDraft(page, "Status keyboard continuation");
  await content.fill("Review status ");
  await content.press("End");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Insert content", exact: true })
    .getByRole("button", { name: /^Status / })
    .click();
  const chip = content.locator('span[data-type="status"]');
  await chip.click();
  await page
    .getByRole("textbox", { name: "Status label", exact: true })
    .fill("Ready");
  await page.getByLabel("Status color", { exact: true }).selectOption("green");
  // Selecting an atomic status followed by Enter must preserve it even before
  // the browser delivers a delayed native selectionchange event.
  await chip.click();
  await content.press("Enter");
  await content.pressSequentially("Additional review context.");
  await expect(chip).toHaveText("Ready");
  await expect(chip).toHaveAttribute("data-tone", "green");
  await expect(content.locator("p").last()).toHaveText(
    "Additional review context.",
  );
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect(
    page.locator(".article-content .document-status.status-green"),
  ).toHaveText("Ready");
  await expect(page.locator(".article-content")).toContainText(
    "Additional review context.",
  );
});
