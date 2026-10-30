import { test, expect, type Page } from "@playwright/test";

async function openNewEditor(page: Page) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Page/ }).click();
  return page.getByRole("region", { name: "Create page", exact: true });
}

async function recoveryTitles(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("metrology-confluence-recovery", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          if (!database.objectStoreNames.contains("drafts")) {
            database.close();
            resolve([]);
            return;
          }
          const transaction = database.transaction("drafts", "readonly");
          const records = transaction.objectStore("drafts").getAll();
          transaction.oncomplete = () => {
            database.close();
            resolve(records.result.map((record) => record.page.Title));
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

test("a reload restores a new draft's metadata and staged image, then publishes one page and clears its recovery copies", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Knowledge home", exact: true }),
  ).toBeVisible();
  const backendBefore = await page.evaluate(() =>
    localStorage.getItem("metrology-confluence:demo:v1"),
  );
  const editor = await openNewEditor(page);
  await editor
    .getByLabel("Title", { exact: true })
    .fill("Recovered calibration note");
  await editor.getByLabel("Space", { exact: true }).selectOption("2");
  await editor
    .getByLabel("Starter template", { exact: true })
    .selectOption("sop");
  const content = editor.getByRole("textbox", {
    name: "Article content",
    exact: true,
  });
  await content.fill("Recovered measurement instructions.");
  await editor
    .getByRole("button", { name: "Page details", exact: true })
    .click();
  await editor
    .getByLabel("Summary", { exact: true })
    .fill("Recovered details for the engineering team.");
  await editor
    .getByLabel("Tags", { exact: true })
    .fill("recovery, calibration");
  await editor
    .getByRole("combobox", { name: "Parent page", exact: true })
    .selectOption("5");
  await editor
    .getByLabel("Change note", { exact: true })
    .fill("Preserved through a reload.");
  await content.press("Control+End");
  await content.press("Enter");
  await editor
    .getByLabel("Upload editor images", { exact: true })
    .setInputFiles({
      name: "recovery-reference.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP4kAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  const staged = content.locator("img");
  await staged.click();
  await editor
    .getByLabel("Image description", { exact: true })
    .fill("Recovered reference image");
  await editor.getByLabel("Image width", { exact: true }).selectOption("50%");
  const previousBlobUrl = await staged.getAttribute("src");
  await expect(editor.locator(".rich-recovery-status")).toHaveText(
    "Saved on this device",
  );
  await expect
    .poll(() => recoveryTitles(page))
    .toEqual(["Recovered calibration note"]);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("metrology-confluence:demo:v1"),
    ),
  ).toBe(backendBefore);

  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Knowledge home", exact: true }),
  ).toBeVisible();
  const reopened = await openNewEditor(page);
  const recovery = reopened.getByRole("complementary", {
    name: "Draft recovery",
    exact: true,
  });
  await expect(recovery).toContainText("Recovered calibration note");
  await expect(reopened.getByLabel("Title", { exact: true })).toHaveValue("");
  await recovery
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(reopened.getByLabel("Title", { exact: true })).toHaveValue(
    "Recovered calibration note",
  );
  await expect(reopened.getByLabel("Space", { exact: true })).toHaveValue("2");
  await expect(
    reopened.getByLabel("Starter template", { exact: true }),
  ).toHaveValue("sop");
  await reopened
    .getByRole("button", { name: "Page details", exact: true })
    .click();
  await expect(reopened.getByLabel("Summary", { exact: true })).toHaveValue(
    "Recovered details for the engineering team.",
  );
  await expect(reopened.getByLabel("Tags", { exact: true })).toHaveValue(
    "recovery, calibration",
  );
  await expect(
    reopened.getByRole("combobox", { name: "Parent page", exact: true }),
  ).toHaveValue("5");
  await expect(reopened.getByLabel("Change note", { exact: true })).toHaveValue(
    "Preserved through a reload.",
  );
  const restoredContent = reopened.getByRole("textbox", {
    name: "Article content",
    exact: true,
  });
  await expect(restoredContent).toContainText(
    "Recovered measurement instructions.",
  );
  const restoredImage = restoredContent.locator("img");
  await expect(restoredImage).toHaveAttribute(
    "alt",
    "Recovered reference image",
  );
  await expect(restoredImage).toHaveAttribute("width", "50%");
  expect(await restoredImage.getAttribute("src")).toMatch(/^blob:/);
  expect(await restoredImage.getAttribute("src")).not.toBe(previousBlobUrl);
  await expect
    .poll(() =>
      restoredImage.evaluate(
        (image) => (image as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
  await reopened
    .getByRole("button", { name: "Publish page", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Recovered calibration note",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".attachment-card")).toHaveCount(1);
  const readerImage = page.locator(".article-content img");
  await expect(readerImage).toHaveAttribute("alt", "Recovered reference image");
  expect(await readerImage.getAttribute("src")).not.toMatch(/^blob:/);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("metrology-confluence:demo:v1")!),
  );
  const records = saved.pages.filter(
    (record: { Title: string }) =>
      record.Title === "Recovered calibration note",
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    SpaceId: 2,
    ParentPageId: 5,
    Summary: "Recovered details for the engineering team.",
    Tags: ["recovery", "calibration"],
    TemplateType: "sop",
    Status: "Published",
  });
  expect(saved.pages).toHaveLength(JSON.parse(backendBefore!).pages.length + 1);
  expect(saved.attachments[String(records[0].Id)]).toHaveLength(1);
  await expect.poll(() => recoveryTitles(page)).toEqual([]);
  const fresh = await openNewEditor(page);
  await expect(fresh.locator(".rich-recovery-status")).toHaveText(
    "Device recovery ready",
  );
  await expect(
    fresh.getByRole("complementary", { name: "Draft recovery", exact: true }),
  ).toHaveCount(0);
});

test("explicitly discarding unsaved work removes its recovery copy and it stays gone after reload", async ({
  page,
}) => {
  await page.goto("/");
  const editor = await openNewEditor(page);
  await editor
    .getByLabel("Title", { exact: true })
    .fill("Intentionally discarded draft");
  await editor
    .getByRole("textbox", { name: "Article content", exact: true })
    .fill("This local work should not return.");
  await expect(editor.locator(".rich-recovery-status")).toHaveText(
    "Saved on this device",
  );
  await expect
    .poll(() => recoveryTitles(page))
    .toEqual(["Intentionally discarded draft"]);
  await editor
    .getByRole("button", { name: "Close editor", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Knowledge home", exact: true }),
  ).toBeVisible();
  await expect.poll(() => recoveryTitles(page)).toEqual([]);
  await page.reload();
  const fresh = await openNewEditor(page);
  await expect(fresh.locator(".rich-recovery-status")).toHaveText(
    "Device recovery ready",
  );
  await expect(
    fresh.getByRole("complementary", { name: "Draft recovery", exact: true }),
  ).toHaveCount(0);
  await expect(fresh.getByLabel("Title", { exact: true })).toHaveValue("");
});
