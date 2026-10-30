import { test, expect } from "@playwright/test";

test("dragged table column widths survive publishing, reload, and reopening the visual editor", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Resized calibration table");
  const editor = page.getByRole("textbox", { name: "Article content" });
  await editor.fill("Measurement results");
  await editor.press("End");
  await editor.press("Enter");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: /^Table Organize/ }).click();
  const firstCell = editor.locator("th").first();
  await firstCell.click();
  await page.keyboard.type("Reference standard");
  const box = await firstCell.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width - 2, box!.y + box!.height / 2);
  await expect(editor.locator(".column-resize-handle").first()).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width + 68, box!.y + box!.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(firstCell).toHaveAttribute("colwidth", /^\d+$/);
  const width = Number(await firstCell.getAttribute("colwidth"));
  expect(width).toBeGreaterThan(box!.width + 40);
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Resized calibration table",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".article-content table col").first(),
  ).toHaveAttribute("style", `width: ${width}px;`);
  await page.reload();
  await expect(
    page.locator(".article-content table col").first(),
  ).toHaveAttribute("style", `width: ${width}px;`);
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await expect(
    page
      .getByRole("textbox", { name: "Article content" })
      .locator("th")
      .first(),
  ).toHaveAttribute("colwidth", String(width));
});
