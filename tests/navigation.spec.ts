import { test, expect } from "@playwright/test";

test("Markdown heading links retain the article route and page links navigate", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Article anchor navigation");
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
  await page
    .getByLabel("Article Markdown")
    .fill(
      "[Jump to procedure](#procedure)\n\n[Open related article](#page=1)\n\n## Procedure\n\nFollow the documented steps.",
    );
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Article anchor navigation",
      exact: true,
    }),
  ).toBeVisible();
  const articleUrl = page.url();
  const anchor = page.getByRole("link", { name: "Jump to procedure" });
  await anchor.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Procedure", exact: true }),
  ).toBeFocused();
  await expect(page).toHaveURL(articleUrl);
  await expect(page.locator(".article-view")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Article anchor navigation",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open related article" }).click();
  await expect(page).toHaveURL(/#page=1$/);
  await expect(page.locator(".article-view")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Article anchor navigation",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("a rejected history update does not bypass the hash-change unsaved-edit guard", async ({
  page,
}) => {
  await page.addInitScript(() => {
    History.prototype.pushState = History.prototype.replaceState = () => {
      throw new DOMException("History blocked", "SecurityError");
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#page=1");
  await page.getByLabel("More page actions", { exact: true }).click();
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Still editing this page");
  await page.evaluate(() => {
    location.hash = "page=2";
  });
  const confirmation = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Still editing this page",
  );
  await page.evaluate(() => {
    location.hash = "page=3";
  });
  await confirmation
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.locator(".article-view")).toBeVisible();
  await expect(page.locator(".rich-editor")).toHaveCount(0);
  expect(errors).toEqual([]);
});
