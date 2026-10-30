import { test, expect, type Page } from "@playwright/test";

const article =
  "**calibration** record\n\nCalibration record\n\ncalibration record\n\nUnrelated **approved** method.\n\n[Unrelated resource](https://example.com/calibration-record)";

async function openFind(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByRole("button", { name: "More formatting", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Switch to Markdown source?", exact: true })
    .getByRole("button", { name: "Switch to source", exact: true })
    .click();
  await page.getByLabel("Article Markdown").fill(article);
  await page
    .getByRole("button", { name: "Return to visual editor", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "Article content" });
  await expect(editor.locator("strong").first()).toHaveText("calibration");
  await page.getByRole("button", { name: "Page tools", exact: true }).click();
  await page
    .getByRole("button", { name: "Find and replace", exact: true })
    .click();
  const finder = page.getByRole("region", {
    name: "Find and replace",
    exact: true,
  });
  await expect(finder).toBeVisible();
  return { editor, finder };
}

test("find crosses formatting marks and replaces current or all matches with undo", async ({
  page,
}) => {
  const { editor, finder } = await openFind(
    page,
    "Authoring search and replacement",
  );
  await finder
    .getByLabel("Find text", { exact: true })
    .fill("calibration record");
  await expect(finder.getByRole("status")).toHaveText("1 of 3 matches");
  await finder.getByLabel("Match case", { exact: true }).check();
  await expect(finder.getByRole("status")).toHaveText("1 of 2 matches");
  await finder
    .getByLabel("Replace with", { exact: true })
    .fill("verification log");
  await finder.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(editor.locator("p").nth(0)).toHaveText("verification log");
  await expect(editor.locator("p").nth(1)).toHaveText("Calibration record");
  await expect(editor.locator("p").nth(2)).toHaveText("calibration record");
  await expect(
    editor.locator("strong").filter({ hasText: /^approved$/ }),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator("p").nth(0)).toHaveText("calibration record");
  await expect(editor.locator("strong").first()).toHaveText("calibration");
  await expect(finder.getByRole("status")).toHaveText(/^[12] of 2 matches$/);

  await finder.getByLabel("Match case", { exact: true }).uncheck();
  await finder
    .getByRole("button", { name: "Replace all", exact: true })
    .click();
  await expect(
    editor.locator("p").filter({ hasText: /^verification log$/ }),
  ).toHaveCount(3);
  await expect(finder.getByRole("status")).toHaveText("No matches");
  await expect(
    editor.locator("strong").filter({ hasText: /^approved$/ }),
  ).toHaveCount(1);
  await expect(
    editor.getByRole("link", { name: "Unrelated resource" }),
  ).toHaveAttribute("href", "https://example.com/calibration-record");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator("p").nth(1)).toHaveText("Calibration record");
  await expect(editor.locator("strong").first()).toHaveText("calibration");
  await expect(finder.getByRole("status")).toHaveText(/^[123] of 3 matches$/);
  await finder.getByLabel("Find text", { exact: true }).press("Escape");
  await expect(finder).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Create page", exact: true }),
  ).toBeVisible();
});

test("find avoids attributes and paragraph boundaries, and replacement stays literal after save", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { editor, finder } = await openFind(
    page,
    "Literal replacement persists",
  );
  const find = finder.getByLabel("Find text", { exact: true });
  await find.fill("example.com/calibration-record");
  await expect(finder.getByRole("status")).toHaveText("No matches");
  await expect(
    finder.getByRole("button", { name: "Replace all", exact: true }),
  ).toBeDisabled();
  await find.fill("record Calibration");
  await expect(finder.getByRole("status")).toHaveText("No matches");
  await find.fill("calibration record");
  await expect(finder.getByRole("status")).toHaveText("1 of 3 matches");
  await finder
    .getByLabel("Replace with", { exact: true })
    .fill("<check & log>");
  await finder
    .getByRole("button", { name: "Replace all", exact: true })
    .click();
  await expect(
    editor.locator("p").filter({ hasText: /^<check & log>$/ }),
  ).toHaveCount(3);
  await finder
    .getByRole("button", { name: "Close find and replace", exact: true })
    .click();
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Literal replacement persists",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  const content = page.locator(".article-content");
  await expect(
    content.locator("p").filter({ hasText: /^<check & log>$/ }),
  ).toHaveCount(3);
  await expect(
    content.locator("strong").filter({ hasText: /^approved$/ }),
  ).toHaveCount(1);
  await expect(
    content.getByRole("link", { name: "Unrelated resource" }),
  ).toHaveAttribute("href", "https://example.com/calibration-record");
  expect(errors).toEqual([]);
});
