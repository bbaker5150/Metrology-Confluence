import { describe, expect, it, vi } from "vitest";
import type { Attachment, Page, PendingImage } from "../types";
vi.mock("./sharepointService", () => ({ service: {} }));
import {
  ImageSaveError,
  imageAttachmentName,
  savePageWithImages,
  type ImageSaveStore,
} from "./imageSave";

const rich = "<!-- metrology-rich-text:v1 -->\n";
const image = (id = "image-0001"): PendingImage => ({
  id,
  file: new File(["raster-image-data"], "reference.png", { type: "image/png" }),
  previewUrl: `blob:https://site.test/${id}`,
});
const page = (updates: Partial<Page> = {}): Page => ({
  Id: 5,
  Title: "Procedure",
  SpaceId: 1,
  ParentPageId: null,
  Content: rich + "<p>Original content</p>",
  Summary: "",
  Tags: [],
  Status: "Published",
  IsPinned: false,
  TemplateType: "blank",
  VersionCount: 1,
  AuthorName: "Editor",
  LastEditorName: "Editor",
  Created: "2026-01-01T00:00:00Z",
  Modified: "2026-01-01T00:00:00Z",
  etag: '"1"',
  ...updates,
});
function fakeStore(initial: Page[] = []) {
  let rows = structuredClone(initial);
  let generation = 1;
  const attachments: Attachment[] = [];
  const store: ImageSaveStore = {
    mode: "sharepoint",
    getPages: vi.fn(async () => structuredClone(rows)),
    getAttachments: vi.fn(async () => structuredClone(attachments)),
    uploadAttachment: vi.fn(async (pageId, file) => {
      const result = {
        FileName: file.name,
        ServerRelativeUrl: `/sites/lab/Lists/Pages/Attachments/${pageId}/${file.name}`,
      };
      attachments.push(result);
      rows = rows.map((row) =>
        row.Id === pageId ? { ...row, etag: `"${++generation}"` } : row,
      );
      return result;
    }),
    savePage: vi.fn(async (input) => {
      if (input.Id)
        expect(input.etag).toBe(rows.find((row) => row.Id === input.Id)?.etag);
      const saved = page({
        ...input,
        Id: input.Id || 10,
        etag: `"${++generation}"`,
        VersionCount:
          (rows.find((row) => row.Id === input.Id)?.VersionCount ?? 0) + 1,
      });
      rows = rows.filter((row) => row.Id !== saved.Id).concat(saved);
      return structuredClone(saved);
    }),
  };
  return {
    store,
    attachments,
    get rows() {
      return rows;
    },
    mutate: (fn: (row: Page) => Page) => {
      rows = rows.map(fn);
    },
  };
}

describe("staged article images", () => {
  it("creates a draft without temporary sources, uploads attachments, then publishes permanent URLs", async () => {
    const pending = image();
    const fixture = fakeStore();
    const saved = await savePageWithImages(
      {
        Title: "Procedure",
        SpaceId: 1,
        Status: "Published",
        Content: `${rich}<p>Instructions</p><img src="${pending.previewUrl}" alt="reference">`,
      },
      "Added reference",
      [pending],
      fixture.store,
    );
    const calls = vi.mocked(fixture.store.savePage).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].Status).toBe("Draft");
    expect(calls[0][0].Content).not.toContain("blob:");
    expect(calls[1][0].Id).toBe(10);
    expect(calls[1][0].Status).toBe("Published");
    expect(saved.Content).toContain(
      `/Attachments/10/${imageAttachmentName(pending)}`,
    );
    expect(saved.Content).not.toContain("blob:");
    expect(fixture.rows).toHaveLength(1);
  });

  it("keeps partial progress and reuses the draft and successful files when an upload is retried", async () => {
    const first = image("image-0001"),
      second = image("image-0002");
    const fixture = fakeStore();
    const realUpload = fixture.store.uploadAttachment;
    fixture.store.uploadAttachment = vi.fn(async (id, file) => {
      if (file.name === imageAttachmentName(second))
        throw new Error("Connection interrupted");
      return realUpload(id, file);
    });
    const initial = {
      Title: "Procedure",
      SpaceId: 1,
      Status: "Published" as const,
      Content: `${rich}<img src="${first.previewUrl}"><img src="${second.previewUrl}">`,
    };
    let recovery: ImageSaveError | undefined;
    try {
      await savePageWithImages(
        initial,
        "Added images",
        [first, second],
        fixture.store,
      );
    } catch (error) {
      recovery = error as ImageSaveError;
    }
    expect(recovery).toBeInstanceOf(ImageSaveError);
    expect(recovery!.retryBlocked).toBe(false);
    expect(recovery!.page.Id).toBe(10);
    expect(recovery!.page.Content).not.toContain(first.previewUrl);
    expect(recovery!.remainingImages.map((item) => item.id)).toEqual([
      second.id,
    ]);
    fixture.store.uploadAttachment = realUpload;
    const saved = await savePageWithImages(
      recovery!.page,
      "Added images",
      recovery!.remainingImages,
      fixture.store,
    );
    expect(saved.Status).toBe("Published");
    expect(saved.Content).not.toContain("blob:");
    expect(fixture.rows).toHaveLength(1);
    expect(fixture.attachments).toHaveLength(2);
    expect(
      vi
        .mocked(fixture.store.savePage)
        .mock.calls.filter(([input]) => !input.Id),
    ).toHaveLength(1);
  });

  it("reconciles an attachment after its successful upload response was lost", async () => {
    const pending = image();
    const baseline = page();
    const fixture = fakeStore([baseline]);
    const realUpload = fixture.store.uploadAttachment;
    fixture.store.uploadAttachment = vi.fn(async (id, file) => {
      await realUpload(id, file);
      throw new Error("Response lost");
    });
    let recovery: ImageSaveError | undefined;
    try {
      await savePageWithImages(
        { ...baseline, Content: `${rich}<img src="${pending.previewUrl}">` },
        "Image",
        [pending],
        fixture.store,
      );
    } catch (error) {
      recovery = error as ImageSaveError;
    }
    expect(recovery!.retryBlocked).toBe(false);
    fixture.store.uploadAttachment = vi.fn(async () => {
      throw new Error("Must not repeat upload");
    });
    const saved = await savePageWithImages(
      recovery!.page,
      "Image",
      recovery!.remainingImages,
      fixture.store,
    );
    expect(saved.Content).not.toContain("blob:");
    expect(fixture.attachments).toHaveLength(1);
    expect(fixture.store.uploadAttachment).not.toHaveBeenCalled();
  });

  it("refuses to refresh the edit token over a teammate’s content change during upload", async () => {
    const pending = image();
    const baseline = page();
    const fixture = fakeStore([baseline]);
    const realUpload = fixture.store.uploadAttachment;
    fixture.store.uploadAttachment = vi.fn(async (id, file) => {
      const uploaded = await realUpload(id, file);
      fixture.mutate((row) => ({
        ...row,
        Content: "Another editor’s new content",
        VersionCount: 2,
      }));
      return uploaded;
    });
    await expect(
      savePageWithImages(
        { ...baseline, Content: `${rich}<img src="${pending.previewUrl}">` },
        "Image",
        [pending],
        fixture.store,
      ),
    ).rejects.toMatchObject({
      name: "ImageSaveError",
      retryBlocked: true,
      page: { etag: baseline.etag },
      remainingImages: [],
    });
    expect(fixture.store.savePage).not.toHaveBeenCalled();
    expect(fixture.rows[0].Content).toBe("Another editor’s new content");
  });

  it("blocks a blind retry when initial draft creation cannot be confirmed", async () => {
    const pending = image();
    const fixture = fakeStore();
    fixture.store.savePage = vi.fn(async () => {
      throw new Error("Request timed out");
    });
    await expect(
      savePageWithImages(
        {
          Title: "Procedure",
          SpaceId: 1,
          Content: `${rich}<img src="${pending.previewUrl}">`,
        },
        "",
        [pending],
        fixture.store,
      ),
    ).rejects.toMatchObject({ retryBlocked: true, remainingImages: [pending] });
    expect(fixture.store.uploadAttachment).not.toHaveBeenCalled();
  });

  it("rejects unsupported or missing staged images before making any writes", async () => {
    const pending = image();
    const fixture = fakeStore();
    const svg = {
      ...pending,
      file: new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
    };
    const input = {
      Title: "Procedure",
      SpaceId: 1,
      Content: `${rich}<img src="${pending.previewUrl}">`,
    };
    await expect(
      savePageWithImages(input, "", [svg], fixture.store),
    ).rejects.toThrow("PNG, JPEG, GIF, or WebP");
    await expect(
      savePageWithImages(input, "", [], fixture.store),
    ).rejects.toThrow("no longer available");
    expect(fixture.store.savePage).not.toHaveBeenCalled();
    expect(fixture.store.uploadAttachment).not.toHaveBeenCalled();
  });
});
