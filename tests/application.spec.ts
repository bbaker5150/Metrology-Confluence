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
      name: "Good work starts with shared knowledge.",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create page", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Browser verification procedure");
  await page.getByLabel("Starter template").selectOption("sop");
  await page
    .getByLabel("Summary", { exact: true })
    .fill("A saved procedure used to verify the portable build.");
  await page
    .getByLabel("Tags", { exact: true })
    .fill("verification, calibration");
  await page.getByRole("button", { name: "Publish page" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Browser verification procedure",
      exact: true,
    }),
  ).toBeVisible();
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
  await page
    .getByLabel("Upload attachments")
    .setInputFiles({
      name: "reference.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Measurement reference"),
    });
  await expect(page.getByRole("link", { name: "reference.txt" })).toBeVisible();
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await page
    .getByLabel("Article Markdown")
    .fill("## Updated procedure\n\nThis is a revised article.");
  await page.getByRole("button", { name: "Publish page" }).click();
  await expect(
    page.getByRole("heading", { name: "Updated procedure" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await page.getByRole("button", { name: /Version 1/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restore", exact: true }).click();
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
  await page.getByRole("searchbox").fill("Browser verification");
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
  await page
    .getByRole("button", { name: "Create page", exact: true })
    .first()
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Safe Markdown");
  await page
    .getByLabel("Article Markdown")
    .fill(
      "## Safe content\n\n<script>window.compromised = true</script>\n\n[bad](javascript:alert(1))",
    );
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
});
