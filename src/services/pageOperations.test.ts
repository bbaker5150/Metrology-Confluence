// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Attachment, Page, PageInput, Space } from "../types";
import { KnowledgeService } from "./sharepointService";
import {
  archivePage,
  descendantPageIds,
  duplicatePage,
  movePage,
  PageOperationError,
  remapAttachmentReferences,
  restoreArchivedPage,
  type PageOperationsStore,
} from "./pageOperations";
import { RICH_PREFIX } from "../lib/content";

const page = (updates: Partial<Page> = {}): Page => ({
  Id: 1,
  Title: "Original guide",
  SpaceId: 1,
  ParentPageId: null,
  Content: "## Procedure\n\nFollow the approved method.",
  Summary: "A reference",
  Tags: ["reference"],
  Status: "Published",
  IsPinned: true,
  TemplateType: "sop",
  VersionCount: 7,
  AuthorId: 9,
  AuthorName: "Original author",
  LastEditorName: "Original author",
  Created: "2026-01-01",
  Modified: "2026-01-01",
  etag: '"7"',
  ...updates,
});
const space = (Id: number): Space => ({
  Id,
  Title: `Space ${Id}`,
  Slug: `space-${Id}`,
  Description: "",
  IconName: "BookOpen",
  AccentColor: "#207de9",
  SortOrder: Id,
  IsArchived: false,
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture(initial: Page[] = [page()]) {
  let rows = clone(initial);
  let generation = 20;
  const attachments = new Map<number, Attachment[]>();
  const bytes = new Map<string, File>();
  const store: PageOperationsStore = {
    mode: "sharepoint",
    getPages: vi.fn(async () => clone(rows)),
    getSpaces: vi.fn(async () => [space(1), space(2)]),
    getAttachments: vi.fn(async (id) => clone(attachments.get(id) || [])),
    readAttachment: vi.fn(async (id, name) => {
      const file = bytes.get(`${id}/${name}`);
      if (!file) throw new Error("Not found");
      return file;
    }),
    uploadAttachment: vi.fn(async (id, file) => {
      const attached = {
        FileName: file.name,
        ServerRelativeUrl: `${location.origin}/sites/lab/Attachments/${id}/${encodeURIComponent(file.name)}`,
        Size: file.size,
        MimeType: file.type,
      };
      attachments.set(id, [...(attachments.get(id) || []), attached]);
      rows = rows.map((row) =>
        row.Id === id
          ? { ...row, etag: `"${++generation}"`, Modified: "after upload" }
          : row,
      );
      return attached;
    }),
    savePage: vi.fn(async (input: PageInput) => {
      const current = input.Id
        ? rows.find((row) => row.Id === input.Id)
        : undefined;
      if (current) expect(input.etag).toBe(current.etag);
      const saved = page({
        ...input,
        Id: input.Id ?? 100,
        etag: `"${++generation}"`,
        VersionCount: (current?.VersionCount || 0) + 1,
        AuthorId: current?.AuthorId ?? 42,
        AuthorName: current?.AuthorName ?? "Copy author",
        LastEditorName: "Copy author",
      });
      rows = rows.filter((row) => row.Id !== saved.Id).concat(saved);
      return clone(saved);
    }),
  };
  return {
    store,
    attachments,
    bytes,
    get rows() {
      return rows;
    },
    mutate: (id: number, update: Partial<Page>) => {
      rows = rows.map((row) => (row.Id === id ? { ...row, ...update } : row));
    },
  };
}
const destination = { title: "Copied guide", spaceId: 2, parentPageId: null };

describe("page duplication", () => {
  it("copies every attachment to an independent draft and rewrites only real destinations", async () => {
    const photoUrl = `${location.origin}/sites/lab/Attachments/1/Photo%20A.png`;
    const pdfUrl = `${location.origin}/sites/lab/Attachments/1/reference.pdf`;
    const original = page({
      Content: `${RICH_PREFIX}<p><img src="${photoUrl}" alt="Reference"></p><a href="${pdfUrl}?download=1#page=2">File</a><pre><code>${photoUrl}</code></pre>`,
    });
    const f = fixture([original, page({ Id: 2, ParentPageId: 1 })]);
    const photo = new File(["image bytes"], "Photo A.png", {
      type: "image/png",
    });
    const pdf = new File(["%PDF-document"], "reference.pdf", {
      type: "application/pdf",
    });
    const unused = new File(["Unreferenced notes"], "notes.txt", {
      type: "text/plain",
    });
    f.attachments.set(1, [
      { FileName: photo.name, ServerRelativeUrl: photoUrl },
      { FileName: pdf.name, ServerRelativeUrl: pdfUrl },
      {
        FileName: unused.name,
        ServerRelativeUrl: "/sites/lab/Attachments/1/notes.txt",
      },
    ]);
    [photo, pdf, unused].forEach((file) => f.bytes.set(`1/${file.name}`, file));
    const copied = await duplicatePage(original, destination, f.store);
    expect(f.store.uploadAttachment).toHaveBeenCalledTimes(3);
    expect(
      vi
        .mocked(f.store.uploadAttachment)
        .mock.calls.map(([id, file]) => [id, file]),
    ).toEqual([
      [100, photo],
      [100, pdf],
      [100, unused],
    ]);
    expect(copied).toMatchObject({
      Id: 100,
      Title: "Copied guide",
      SpaceId: 2,
      Status: "Draft",
      IsPinned: false,
      AuthorId: 42,
      VersionCount: 2,
      Summary: original.Summary,
      Tags: original.Tags,
      TemplateType: "sop",
    });
    expect(copied.Content).toContain("/Attachments/100/Photo%20A.png");
    expect(copied.Content).toContain(
      "/Attachments/100/reference.pdf?download=1#page=2",
    );
    expect(copied.Content).toContain(`<code>${photoUrl}</code>`);
    expect(f.rows.find((row) => row.Id === 1)).toEqual(original);
    expect(f.rows.find((row) => row.Id === 2)?.ParentPageId).toBe(1);
    const first = vi.mocked(f.store.savePage).mock.calls[0][0];
    expect(first.Content).toBe("");
    expect(first).not.toHaveProperty("AuthorId");
    expect(first).not.toHaveProperty("AuthorName");
    expect(first).not.toHaveProperty("Id");
    expect(first).not.toHaveProperty("VersionCount");
  });

  it("converts Markdown links and images without replacing prose or external lookalikes", () => {
    const content =
      "![ref](/sites/lab/Attachments/1/a.png)\n\n[Attachment](/sites/lab/Attachments/1/a.png?download=1)\n\n`/sites/lab/Attachments/1/a.png`\n\n[Other](https://elsewhere.test/sites/lab/Attachments/1/a.png)";
    const output = remapAttachmentReferences(
      content,
      new Map([
        ["/sites/lab/Attachments/1/a.png", "/sites/lab/Attachments/100/a.png"],
      ]),
    );
    expect(output.startsWith(RICH_PREFIX)).toBe(true);
    expect(output).toContain(
      'src="' + location.origin + '/sites/lab/Attachments/100/a.png"',
    );
    expect(output).toContain('/Attachments/100/a.png?download=1"');
    expect(output).toContain("<code>/sites/lab/Attachments/1/a.png</code>");
    expect(output).toContain(
      'href="https://elsewhere.test/sites/lab/Attachments/1/a.png"',
    );
  });

  it("matches encoded filename punctuation without collapsing encoded path separators", () => {
    const content = `${RICH_PREFIX}<img src="/files/A%2BB.png"><a href="/files/A%26B.pdf">PDF</a><a href="/files/folder%2Fguide.pdf">Encoded separator</a>`;
    const output = remapAttachmentReferences(
      content,
      new Map([
        ["/files/A+B.png", "/copy/A+B.png"],
        ["/files/A&B.pdf", "/copy/A&B.pdf"],
        ["/files/folder/guide.pdf", "/copy/guide.pdf"],
      ]),
    );
    const parsed = document.createElement("template");
    parsed.innerHTML = output.slice(RICH_PREFIX.length);
    expect(parsed.content.querySelector("img")?.getAttribute("src")).toBe(
      `${location.origin}/copy/A+B.png`,
    );
    expect(parsed.content.querySelector("a")?.getAttribute("href")).toBe(
      `${location.origin}/copy/A&B.pdf`,
    );
    expect(parsed.content.querySelectorAll("a")[1].getAttribute("href")).toBe(
      "/files/folder%2Fguide.pdf",
    );
  });

  it("rejects stale source revisions, invalid parents, unsafe names, and unreadable files before creating a draft", async () => {
    const f = fixture([page(), page({ Id: 2, Status: "Archived" })]);
    await expect(
      duplicatePage(page({ etag: '"old"' }), destination, f.store),
    ).rejects.toMatchObject({ retryBlocked: false });
    await expect(
      duplicatePage(
        page(),
        { ...destination, spaceId: 1, parentPageId: 2 },
        f.store,
      ),
    ).rejects.toThrow(/archive/i);
    f.attachments.set(1, [
      { FileName: "script.js", ServerRelativeUrl: "/file" },
    ]);
    await expect(duplicatePage(page(), destination, f.store)).rejects.toThrow(
      /cannot be copied/i,
    );
    f.attachments.set(1, [
      { FileName: "safe.txt", ServerRelativeUrl: "/file" },
    ]);
    await expect(duplicatePage(page(), destination, f.store)).rejects.toThrow(
      "Not found",
    );
    expect(f.store.savePage).not.toHaveBeenCalled();
  });

  it("rechecks the source and attachment manifest after download, before the first write", async () => {
    const f = fixture();
    f.attachments.set(1, [{ FileName: "a.txt", ServerRelativeUrl: "/a.txt" }]);
    f.store.readAttachment = vi.fn(async () => {
      f.attachments
        .get(1)!
        .push({ FileName: "b.txt", ServerRelativeUrl: "/b.txt" });
      return new File(["A"], "a.txt");
    });
    await expect(duplicatePage(page(), destination, f.store)).rejects.toThrow(
      /attachments changed/i,
    );
    expect(f.store.savePage).not.toHaveBeenCalled();
  });

  it("enforces aggregate and per-file limits before creating a copy", async () => {
    const f = fixture();
    const files = Array.from(
      { length: 6 },
      (_, index) => new File(["bytes"], `file-${index}.txt`),
    );
    for (const file of files) {
      Object.defineProperty(file, "size", { value: 9 * 1024 * 1024 });
      f.bytes.set(`1/${file.name}`, file);
    }
    f.attachments.set(
      1,
      files.map((file) => ({
        FileName: file.name,
        ServerRelativeUrl: `/${file.name}`,
      })),
    );
    await expect(duplicatePage(page(), destination, f.store)).rejects.toThrow(
      /50 MB/,
    );
    expect(f.store.savePage).not.toHaveBeenCalled();
    f.attachments.set(1, [
      {
        FileName: "too-large.pdf",
        ServerRelativeUrl: "/large.pdf",
        Size: 11 * 1024 * 1024,
      },
    ]);
    await expect(duplicatePage(page(), destination, f.store)).rejects.toThrow(
      /too large/,
    );
    expect(f.store.savePage).not.toHaveBeenCalled();
  });

  it("blocks automatic retries after an uncertain create without creating twice", async () => {
    const f = fixture();
    f.store.savePage = vi.fn(async () => {
      throw new Error("Response lost");
    });
    await expect(
      duplicatePage(page(), destination, f.store),
    ).rejects.toMatchObject({ retryBlocked: true, partialPageId: undefined });
    expect(f.store.savePage).toHaveBeenCalledTimes(1);
  });

  it("reports a partial draft after upload failure and keeps source data intact", async () => {
    const f = fixture();
    f.attachments.set(1, [{ FileName: "a.txt", ServerRelativeUrl: "/a.txt" }]);
    f.bytes.set("1/a.txt", new File(["A"], "a.txt"));
    f.store.uploadAttachment = vi.fn(async () => {
      throw new Error("Connection lost");
    });
    await expect(
      duplicatePage(page(), destination, f.store),
    ).rejects.toMatchObject({ retryBlocked: true, partialPageId: 100 });
    expect(f.store.savePage).toHaveBeenCalledTimes(1);
    expect(f.rows.find((row) => row.Id === 100)).toMatchObject({
      Content: "",
      Status: "Draft",
    });
    expect(f.rows.find((row) => row.Id === 1)).toEqual(page());
  });

  it("accepts attachment-only ETag changes but refuses concurrent edits to the new copy", async () => {
    const f = fixture();
    f.attachments.set(1, [{ FileName: "a.txt", ServerRelativeUrl: "/a.txt" }]);
    f.bytes.set("1/a.txt", new File(["A"], "a.txt"));
    const upload = f.store.uploadAttachment;
    f.store.uploadAttachment = vi.fn(async (id, file) => {
      const result = await upload(id, file);
      f.mutate(id, { Content: "Another editor's changes" });
      return result;
    });
    await expect(
      duplicatePage(page(), destination, f.store),
    ).rejects.toMatchObject({ retryBlocked: true, partialPageId: 100 });
    expect(f.store.savePage).toHaveBeenCalledTimes(1);
    expect(f.rows.find((row) => row.Id === 100)?.Content).toBe(
      "Another editor's changes",
    );
  });

  it("refuses a wildcard edit token before the final copy save", async () => {
    const f = fixture();
    const save = f.store.savePage;
    f.store.savePage = vi.fn(async (input, note) => {
      const created = await save(input, note);
      f.mutate(created.Id, { etag: "*" });
      return created;
    });
    await expect(
      duplicatePage(page(), destination, f.store),
    ).rejects.toMatchObject({ retryBlocked: true, partialPageId: 100 });
    expect(f.store.savePage).toHaveBeenCalledTimes(1);
  });
});

describe("page location and archive operations", () => {
  it("moves branches within a space, preserves content and ETag, and rejects cycles or cross-space branches", async () => {
    const f = fixture([
      page(),
      page({ Id: 2, ParentPageId: 1 }),
      page({ Id: 3, ParentPageId: 2, Status: "Archived" }),
      page({ Id: 4 }),
    ]);
    expect([...descendantPageIds(f.rows, 1)]).toEqual([2, 3]);
    await expect(
      movePage(page(), { spaceId: 1, parentPageId: 2 }, f.store),
    ).rejects.toThrow(/descendants/i);
    f.mutate(2, { Status: "Archived" });
    await expect(
      movePage(page(), { spaceId: 2, parentPageId: null }, f.store),
    ).rejects.toThrow(/child pages/i);
    const moved = await movePage(
      page(),
      { spaceId: 1, parentPageId: 4 },
      f.store,
    );
    expect(moved.ParentPageId).toBe(4);
    expect(moved.Content).toBe(page().Content);
    expect(vi.mocked(f.store.savePage).mock.calls[0][0].etag).toBe('"7"');
    expect(f.rows.find((row) => row.Id === 2)?.ParentPageId).toBe(1);
  });

  it("moves a leaf across spaces and refuses missing parents or stale evidence", async () => {
    const f = fixture();
    await expect(
      movePage(
        page({ etag: "*" }),
        { spaceId: 2, parentPageId: null },
        f.store,
      ),
    ).rejects.toThrow(/changed/i);
    await expect(
      movePage(page(), { spaceId: 2, parentPageId: 99 }, f.store),
    ).rejects.toThrow(/no longer exists/i);
    expect(
      (await movePage(page(), { spaceId: 2, parentPageId: null }, f.store))
        .SpaceId,
    ).toBe(2);
  });

  it("archives only after active children are moved or archived, and restores to an explicit state", async () => {
    const f = fixture([
      page(),
      page({ Id: 2, ParentPageId: 1 }),
      page({ Id: 3, ParentPageId: 2 }),
    ]);
    await expect(archivePage(page(), f.store)).rejects.toThrow(/active child/i);
    f.mutate(2, { Status: "Archived" });
    await expect(archivePage(page(), f.store)).rejects.toThrow(/active child/i);
    f.mutate(3, { Status: "Archived" });
    const archived = await archivePage(page(), f.store);
    expect(archived.Status).toBe("Archived");
    expect(archived.IsPinned).toBe(false);
    const restored = await restoreArchivedPage(archived, "Draft", f.store);
    expect(restored.Status).toBe("Draft");
    expect(restored.Content).toBe(page().Content);
    expect(restored.Id).toBe(page().Id);
  });

  it("does not restore a child under an archived ancestor, and fails closed on uncertain mutation", async () => {
    const child = page({ Id: 2, ParentPageId: 1, Status: "Archived" });
    const f = fixture([page({ Status: "Archived" }), child]);
    await expect(
      restoreArchivedPage(child, "Published", f.store),
    ).rejects.toThrow(/ancestors/i);
    f.store.savePage = vi.fn(async () => {
      throw new Error("Response lost");
    });
    await expect(
      movePage(child, { spaceId: 1, parentPageId: null }, f.store),
    ).rejects.toMatchObject({ retryBlocked: true });
    expect(f.store.savePage).toHaveBeenCalledTimes(1);
  });
});

describe("authenticated attachment reads", () => {
  it("reads a verified attachment with a bound native fetch receiver, credentials, and no redirects", async () => {
    const fetcher = vi.fn(async function (this: unknown) {
      expect(this).toBe(globalThis);
      return new Response("%PDF-test", {
        headers: { "Content-Type": "application/pdf" },
      });
    });
    const service = new KnowledgeService(
      { mode: "sharepoint", webUrl: `${location.origin}/sites/lab` },
      fetcher as typeof fetch,
    );
    vi.spyOn(service, "getAttachments").mockResolvedValue([
      {
        FileName: "guide.pdf",
        ServerRelativeUrl: "/sites/lab/Attachments/1/guide.pdf",
      },
    ]);
    const file = await service.readAttachment(1, "guide.pdf");
    expect(file.name).toBe("guide.pdf");
    expect(file.size).toBe(9);
    expect(file.type).toBe("application/pdf");
    expect(fetcher).toHaveBeenCalledWith(
      `${location.origin}/sites/lab/Attachments/1/guide.pdf`,
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
        redirect: "error",
      }),
    );
  });

  it("rejects unknown files, cross-origin destinations, oversized downloads, and sign-in HTML", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("sign in", {
          headers: { "Content-Type": "Text/HTML; charset=utf-8" },
        }),
    );
    const service = new KnowledgeService(
      { mode: "sharepoint", webUrl: `${location.origin}/sites/lab` },
      fetcher as typeof fetch,
    );
    const files = vi.spyOn(service, "getAttachments").mockResolvedValue([]);
    await expect(service.readAttachment(1, "missing.pdf")).rejects.toThrow(
      /no longer exists/,
    );
    files.mockResolvedValue([
      {
        FileName: "guide.pdf",
        ServerRelativeUrl: "https://elsewhere.test/guide.pdf",
      },
    ]);
    await expect(service.readAttachment(1, "guide.pdf")).rejects.toThrow(
      /outside/,
    );
    expect(fetcher).not.toHaveBeenCalled();
    files.mockResolvedValue([
      { FileName: "guide.pdf", ServerRelativeUrl: "/guide.pdf" },
    ]);
    await expect(service.readAttachment(1, "guide.pdf")).rejects.toThrow(
      /HTML page/,
    );
    fetcher.mockResolvedValue(
      new Response(new Uint8Array(10 * 1024 * 1024 + 1)),
    );
    await expect(service.readAttachment(1, "guide.pdf")).rejects.toThrow(
      /too large/,
    );
  });
});
