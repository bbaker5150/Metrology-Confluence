import { test, expect, type Page } from "@playwright/test";

async function createPage(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  return page.getByRole("textbox", { name: "Article content" });
}

test("visual editor preserves formatting, metrology symbols, tables, and language-tagged code", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const editor = await createPage(page, "Rich measurement guide");
  await editor.fill("Measurement method");
  await page.getByLabel("Text style").selectOption("2");
  await editor.press("End");
  await editor.press("Enter");
  await page.getByLabel("Text style").selectOption("paragraph");
  await page
    .getByRole("button", { name: "Bold (Ctrl+B)", exact: true })
    .click();
  await page.keyboard.type("Reference tolerance ");
  await page
    .getByRole("button", { name: "Bold (Ctrl+B)", exact: true })
    .click();
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: /Symbols & emoji/ }).click();
  await page
    .getByRole("textbox", { name: "Search symbols" })
    .fill("plus or minus");
  await page
    .getByRole("button", { name: "Insert Plus or minus", exact: true })
    .click();
  await expect(editor).toBeFocused();
  await page.keyboard.type(" 0.01 mm");
  await editor.press("End");
  await editor.press("Enter");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: /^Table Organize/ }).click();
  await editor.locator("th").first().click();
  await page.keyboard.type("Reference");
  await page.getByRole("button", { name: "Row", exact: true }).click();
  await expect(editor.locator("tr")).toHaveCount(4);
  // The editor keeps an empty paragraph after the table for continued writing.
  await editor.press("Control+End");
  await editor.press("ArrowDown");
  await editor.press("Enter");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: /^Code block/ }).click();
  const code = editor.locator("pre");
  await expect(code).toBeVisible();
  await code.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.insertText("const tolerance = 0.01;");
  await page
    .getByLabel("Code language", { exact: true })
    .selectOption("javascript");
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rich measurement guide", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Measurement method", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".article-content strong")
      .filter({ hasText: "Reference tolerance" }),
  ).toBeVisible();
  await expect(page.locator(".article-content")).toContainText("± 0.01 mm");
  await expect(page.locator(".article-content table tr")).toHaveCount(4);
  await expect(
    page.locator(".article-content code.language-javascript"),
  ).toContainText("const tolerance = 0.01;");
  await page.reload();
  await expect(page.locator(".article-content")).toContainText("± 0.01 mm");
  await expect(
    page.locator(".article-content code.language-javascript"),
  ).toContainText("const tolerance = 0.01;");
  expect(errors).toEqual([]);
});

test("an image staged in a new visual page is attached, rendered, and editable after reload", async ({
  page,
}) => {
  const editor = await createPage(page, "Reference image procedure");
  await editor.fill("Use the reference image below.");
  await editor.press("End");
  await editor.press("Enter");
  await page.getByLabel("Upload editor images").setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP4kAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(editor.locator("img")).toHaveCount(1);
  await editor.locator("img").click();
  await page
    .getByLabel("Image description", { exact: true })
    .fill("Calibration reference target");
  await page.getByLabel("Image width", { exact: true }).selectOption("50%");
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Reference image procedure",
      exact: true,
    }),
  ).toBeVisible();
  const image = page.locator(".article-content img");
  await expect(image).toHaveAttribute("alt", "Calibration reference target");
  await expect(image).toHaveAttribute("width", "50%");
  expect(await image.getAttribute("src")).not.toMatch(/^blob:/);
  await expect(page.locator(".attachment-card")).toHaveCount(1);
  await page.reload();
  await expect(image).toHaveAttribute("alt", "Calibration reference target");
  expect(
    await image.evaluate(
      (img) =>
        (img as HTMLImageElement).complete &&
        (img as HTMLImageElement).naturalWidth > 0,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Article content" }).locator("img"),
  ).toHaveAttribute("alt", "Calibration reference target");
});

test("slash insertion works from the keyboard and Escape closes only the insert panel", async ({
  page,
}) => {
  const editor = await createPage(page, "Keyboard authoring guide");
  await editor.click();
  await page.keyboard.type("/");
  const search = page.getByRole("textbox", { name: "Search insert options" });
  await expect(search).toBeFocused();
  await page.keyboard.type("info panel");
  await page.keyboard.press("Enter");
  await expect(editor.locator('[data-callout="info"]')).toBeVisible();
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search insert options" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Search insert options" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Create page", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Keyboard authoring guide",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".article-content .callout-info")).toContainText(
    "Add your context here.",
  );
});

test("the editor close button closes the document even with an insertion panel open", async ({
  page,
}) => {
  await createPage(page, "Unsaved work");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Insert content", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Create page", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Knowledge home", exact: true }),
  ).toBeVisible();
});

test("opening an existing editor stays clean while actual changes still require discard confirmation", async ({
  page,
}) => {
  const confirmations: string[] = [];
  page.on("dialog", async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.accept();
  });
  await page.goto("/#page=1");
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit page", exact: true });
  await expect(dialog.locator(".rich-save-state")).toHaveText("No changes yet");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(confirmations).toEqual([]);

  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await dialog.getByLabel("Title", { exact: true }).fill("Changed title");
  await expect(dialog.locator(".rich-save-state")).toHaveText(
    "Unsaved changes",
  );
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(confirmations).toEqual(["Discard your unsaved changes?"]);
});
