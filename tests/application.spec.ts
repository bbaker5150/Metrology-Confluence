import { test, expect } from "@playwright/test";
test("portable artifact supports knowledge creation, search, revisions, and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const externalAssets: string[] = [];
  page.on("request", (r) => {
    if (["script", "stylesheet", "font"].includes(r.resourceType()))
      externalAssets.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Knowledge home",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Browser verification procedure");
  await page.getByLabel("Starter template").selectOption("sop");
  await page.getByRole("button", { name: "Page details", exact: true }).click();
  await page
    .getByLabel("Summary", { exact: true })
    .fill("A saved procedure used to verify the portable build.");
  await page
    .getByLabel("Tags", { exact: true })
    .fill("verification, calibration");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Browser verification procedure",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".workspace-topbar")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit page", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Acceptance criteria", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Add a comment", { exact: true })
    .fill("Verified in the bundled HTML.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(
    page.getByText("Verified in the bundled HTML.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Upload attachments").setInputFiles({
    name: "reference.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Measurement reference"),
  });
  await expect(page.getByRole("link", { name: "reference.txt" })).toBeVisible();
  await page.getByLabel("More page actions", { exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Page actions", exact: true })
      .getByRole("button")
      .first(),
  ).toHaveText("Edit page");
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Article content" })
    .fill("Updated procedure");
  // Selecting the existing heading style must not turn it back into a paragraph.
  await page.getByLabel("Text style").selectOption("2");
  await expect(
    page
      .getByRole("textbox", { name: "Article content" })
      .getByRole("heading", { name: "Updated procedure" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Updated procedure" }),
  ).toBeVisible();
  await page.getByLabel("More page actions").click();
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await page.getByRole("button", { name: /Version 1/ }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page
    .getByLabel("Confirm version restore", { exact: true })
    .getByRole("button", { name: "Restore version", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Acceptance criteria", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Browser verification procedure",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Verified in the bundled HTML.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.keyboard.type("Browser verification");
  await expect(page.locator(".search-result")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", {
      name: "Browser verification procedure",
      exact: true,
    }),
  ).toBeVisible();
  expect(externalAssets).toEqual([]);
  expect(errors).toEqual([]);
});
test("mobile navigation, themes, and safe Markdown", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Pinned pages", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pinned pages", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const workspaceActions = page
    .getByRole("group", { name: "Workspace actions", exact: true })
    .getByRole("button");
  expect(
    await workspaceActions.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    ),
  ).toEqual(["Create", "Search knowledge", "Switch to light theme"]);
  const actionSizes = await workspaceActions.evaluateAll((buttons) =>
    buttons.map((button) => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
  );
  expect(actionSizes).toEqual(Array(3).fill({ width: 34, height: 34 }));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  const editor = page.getByRole("region", { name: "Create page", exact: true });
  await expect(editor.getByText("New page", { exact: true })).toHaveCount(0);
  const optionColors = await page
    .getByLabel("Text style")
    .locator("option")
    .first()
    .evaluate((option) => {
      const style = getComputedStyle(option);
      return {
        background: style.backgroundColor,
        color: style.color,
      };
    });
  expect(optionColors.background).toBe("rgb(13, 26, 40)");
  expect(optionColors.color).toBe("rgb(231, 238, 247)");
  await page.getByLabel("Title", { exact: true }).fill("Safe Markdown");
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
      "## Safe content\n\n<script>window.compromised = true</script>\n\n[bad](javascript:alert(1))",
    );
  await page
    .getByRole("button", { name: "Page save options", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Safe Markdown", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.prototype.hasOwnProperty.call(window, "compromised"),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".workspace-topbar")).toHaveCount(0);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Knowledge home", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search knowledge", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Search knowledge", exact: true }),
  ).toBeVisible();
});
