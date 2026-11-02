import type { Attachment, Page, PageInput, Space } from "../types";
import { serializeContent, toEditorHTML } from "../lib/content";
import { service } from "./sharepointService";

export interface PageOperationsStore {
  readonly mode: "local" | "sharepoint";
  getPages(): Promise<Page[]>;
  getSpaces(): Promise<Space[]>;
  getAttachments(pageId: number): Promise<Attachment[]>;
  readAttachment(pageId: number, fileName: string): Promise<File>;
  uploadAttachment(pageId: number, file: File): Promise<Attachment>;
  savePage(page: PageInput, changeNote?: string): Promise<Page>;
}
export interface PageLocation {
  spaceId: number;
  parentPageId: number | null;
}
export interface DuplicatePageOptions extends PageLocation {
  title: string;
}

/** Mutations may succeed before a response is lost; never blindly repeat them. */
export class PageOperationError extends Error {
  constructor(
    message: string,
    public readonly retryBlocked = false,
    public readonly partialPageId?: number,
  ) {
    super(message);
    this.name = "PageOperationError";
  }
}
const explanation = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
const validId = (value: number) => Number.isSafeInteger(value) && value > 0;
const MAX_COPY_BYTES = 50 * 1024 * 1024;
const revisionFields: (keyof Page)[] = [
  "Title",
  "SpaceId",
  "ParentPageId",
  "Content",
  "Summary",
  "Tags",
  "Status",
  "IsPinned",
  "TemplateType",
  "VersionCount",
  "AuthorId",
  "AuthorName",
  "LastEditorName",
];

export function descendantPageIds(pages: Page[], rootId: number): Set<number> {
  const found = new Set<number>();
  const visited = new Set<number>([rootId]);
  const queue = [rootId];
  for (let index = 0; index < queue.length; index++) {
    for (const page of pages) {
      if (page.ParentPageId !== queue[index] || visited.has(page.Id)) continue;
      visited.add(page.Id);
      found.add(page.Id);
      queue.push(page.Id);
    }
  }
  return found;
}

function requireCurrent(input: Page, pages: Page[]): Page {
  const current = pages.find((page) => page.Id === input.Id);
  if (!current)
    throw new PageOperationError(
      "This page no longer exists. Reload the workspace.",
    );
  if (!input.etag || input.etag === "*" || current.etag !== input.etag)
    throw new PageOperationError(
      "This page changed since you opened it. Reload before continuing to protect other editors’ work.",
    );
  return current;
}

function validateLocation(
  location: PageLocation,
  pages: Page[],
  spaces: Space[],
  moving?: Page,
) {
  if (
    !validId(location.spaceId) ||
    !spaces.some((space) => space.Id === location.spaceId && !space.IsArchived)
  )
    throw new PageOperationError("Choose an available space.");
  if (location.parentPageId !== null && !validId(location.parentPageId))
    throw new PageOperationError(
      "Choose a valid parent page or the top level of the space.",
    );
  if (location.parentPageId !== null) {
    let ancestor = pages.find((page) => page.Id === location.parentPageId);
    if (!ancestor)
      throw new PageOperationError("The parent page no longer exists.");
    const visited = new Set<number>(moving ? [moving.Id] : []);
    while (ancestor) {
      if (visited.has(ancestor.Id))
        throw new PageOperationError(
          "A page cannot be moved beneath itself or one of its descendants.",
        );
      visited.add(ancestor.Id);
      if (ancestor.SpaceId !== location.spaceId)
        throw new PageOperationError(
          "The parent page must belong to the selected space.",
        );
      if (ancestor.Status === "Archived")
        throw new PageOperationError(
          "Choose a parent outside the archive, or restore its archived ancestors first.",
        );
      if (ancestor.ParentPageId === null) break;
      ancestor = pages.find((page) => page.Id === ancestor!.ParentPageId);
      if (!ancestor)
        throw new PageOperationError(
          "The parent hierarchy is incomplete. Choose another parent or the top level of the space.",
        );
    }
  }
  if (
    moving &&
    location.spaceId !== moving.SpaceId &&
    pages.some((page) => page.ParentPageId === moving.Id)
  )
    throw new PageOperationError(
      "Move or reparent child pages before moving their parent to another space. You can move this branch within its current space.",
    );
}

async function writePage(
  input: PageInput,
  note: string,
  store: PageOperationsStore,
) {
  try {
    return await store.savePage(input, note);
  } catch (error) {
    throw new PageOperationError(
      `${explanation(error)} Reload the workspace and check the page before retrying; the change may have been saved.`,
      true,
    );
  }
}

export async function movePage(
  page: Page,
  location: PageLocation,
  store: PageOperationsStore = service,
): Promise<Page> {
  const [pages, spaces] = await Promise.all([
    store.getPages(),
    store.getSpaces(),
  ]);
  const current = requireCurrent(page, pages);
  validateLocation(location, pages, spaces, current);
  if (
    current.SpaceId === location.spaceId &&
    current.ParentPageId === location.parentPageId
  )
    return current;
  return writePage(
    {
      ...current,
      etag: page.etag,
      SpaceId: location.spaceId,
      ParentPageId: location.parentPageId,
    },
    "Moved page",
    store,
  );
}

export async function archivePage(
  page: Page,
  store: PageOperationsStore = service,
): Promise<Page> {
  const pages = await store.getPages();
  const current = requireCurrent(page, pages);
  if (current.Status === "Archived") return current;
  const descendants = descendantPageIds(pages, page.Id);
  if (
    pages.some(
      (child) => descendants.has(child.Id) && child.Status !== "Archived",
    )
  )
    throw new PageOperationError(
      "Archive or move the active child pages before archiving this page.",
    );
  return writePage(
    { ...current, etag: page.etag, Status: "Archived", IsPinned: false },
    "Archived page",
    store,
  );
}

export async function restoreArchivedPage(
  page: Page,
  status: "Draft" | "Published",
  store: PageOperationsStore = service,
): Promise<Page> {
  if (status !== "Draft" && status !== "Published")
    throw new PageOperationError(
      "Choose Draft or Published for the restored page.",
    );
  const [pages, spaces] = await Promise.all([
    store.getPages(),
    store.getSpaces(),
  ]);
  const current = requireCurrent(page, pages);
  if (current.Status !== "Archived")
    throw new PageOperationError(
      "This page is no longer archived. Reload the workspace.",
    );
  validateLocation(
    { spaceId: current.SpaceId, parentPageId: current.ParentPageId },
    pages,
    spaces,
    current,
  );
  return writePage(
    { ...current, etag: page.etag, Status: status },
    `Restored archived page as ${status.toLowerCase()}`,
    store,
  );
}

function validateFileName(name: string) {
  if (
    !name ||
    name.length > 128 ||
    /[\\/:*?"<>|#%\x00-\x1f]/.test(name) ||
    /\.(html?|svg|js|mjs|exe|bat|cmd|ps1)$/i.test(name)
  )
    throw new PageOperationError(
      `The attachment “${name}” uses a name or file type that cannot be copied by this app.`,
    );
}

function attachmentKey(value: string): string {
  if (value.startsWith("data:")) return value;
  try {
    const url = new URL(value, document.baseURI);
    // Match equivalent filename spellings (A+B vs A%2BB) without treating
    // an encoded slash inside a segment as an actual directory separator.
    const path = url.pathname
      .split("/")
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join("/");
    return `${url.origin}${path}`;
  } catch {
    return value;
  }
}

/** Rewrite only actual link/image destinations, never prose or code examples. */
export function remapAttachmentReferences(
  content: string,
  replacements: Map<string, string>,
): string {
  const template = document.createElement("template");
  template.innerHTML = toEditorHTML(content);
  const mapped = new Map(
    Array.from(replacements, ([before, after]) => [
      attachmentKey(before),
      after,
    ]),
  );
  for (const element of template.content.querySelectorAll("img[src],a[href]")) {
    const attribute = element.tagName === "IMG" ? "src" : "href";
    const original = element.getAttribute(attribute) || "";
    const replacement = mapped.get(attachmentKey(original));
    if (!replacement) continue;
    let destination = replacement;
    if (!original.startsWith("data:") && !replacement.startsWith("data:")) {
      const before = new URL(original, document.baseURI);
      const after = new URL(replacement, document.baseURI);
      after.search = before.search;
      after.hash = before.hash;
      destination = after.href;
    }
    element.setAttribute(attribute, destination);
  }
  return serializeContent(template.innerHTML);
}

export async function duplicatePage(
  page: Page,
  options: DuplicatePageOptions,
  store: PageOperationsStore = service,
): Promise<Page> {
  if (!options.title.trim() || options.title.trim().length > 255)
    throw new PageOperationError(
      "Enter a page title between 1 and 255 characters.",
    );
  const [pages, spaces] = await Promise.all([
    store.getPages(),
    store.getSpaces(),
  ]);
  const source = requireCurrent(page, pages);
  validateLocation(options, pages, spaces);
  const attachments = await store.getAttachments(source.Id);
  const fileNames = new Set<string>();
  for (const attachment of attachments) {
    validateFileName(attachment.FileName);
    const folded = attachment.FileName.toLowerCase();
    if (fileNames.has(folded))
      throw new PageOperationError(
        "The source contains conflicting attachment names. Rename them before duplicating this page.",
      );
    fileNames.add(folded);
  }
  const files: File[] = [];
  const perFileLimit = (store.mode === "sharepoint" ? 10 : 2) * 1024 * 1024;
  let totalBytes = 0;
  for (const attachment of attachments) {
    if (attachment.Size && attachment.Size > perFileLimit)
      throw new PageOperationError(
        `The attachment “${attachment.FileName}” is too large to copy.`,
      );
    const file = await store.readAttachment(source.Id, attachment.FileName);
    if (file.name !== attachment.FileName || file.size > perFileLimit)
      throw new PageOperationError(
        `The attachment “${attachment.FileName}” could not be copied safely.`,
      );
    totalBytes += file.size;
    if (totalBytes > MAX_COPY_BYTES)
      throw new PageOperationError(
        "This page has more than 50 MB of attachments. Reduce the attachment set before duplicating it.",
      );
    files.push(file);
  }
  // Copying files can take time: reject a changed source or destination before
  // creating anything, instead of silently copying a mixture of revisions.
  const latestPages = await store.getPages();
  requireCurrent(page, latestPages);
  const manifest = (items: Attachment[]) =>
    JSON.stringify(
      items
        .map((file) => [file.FileName, file.ServerRelativeUrl, file.Size])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  if (manifest(await store.getAttachments(source.Id)) !== manifest(attachments))
    throw new PageOperationError(
      "The source attachments changed while they were being read. Reload the page before duplicating it.",
    );
  validateLocation(options, latestPages, await store.getSpaces());
  let draft: Page | undefined;
  try {
    draft = await store.savePage(
      {
        Title: options.title.trim(),
        SpaceId: options.spaceId,
        ParentPageId: options.parentPageId,
        Content: "",
        Summary: source.Summary,
        Tags: [...source.Tags],
        TemplateType: source.TemplateType,
        Status: "Draft",
        IsPinned: false,
      },
      `Started copy of page ${source.Id}`,
    );
    const replacements = new Map<string, string>();
    for (let index = 0; index < files.length; index++) {
      const copied = await store.uploadAttachment(draft.Id, files[index]);
      replacements.set(
        attachments[index].ServerRelativeUrl,
        copied.ServerRelativeUrl,
      );
    }
    const current = (await store.getPages()).find(
      (item) => item.Id === draft!.Id,
    );
    if (
      !current ||
      !current.etag ||
      current.etag === "*" ||
      !revisionFields.every(
        (key) => JSON.stringify(current[key]) === JSON.stringify(draft![key]),
      )
    )
      throw new Error(
        "The new draft changed while attachments were copying. Its content will not be overwritten.",
      );
    return await store.savePage(
      {
        ...current,
        Content: remapAttachmentReferences(source.Content, replacements),
        Status: "Draft",
        IsPinned: false,
      },
      `Duplicated page ${source.Id}`,
    );
  } catch (error) {
    throw new PageOperationError(
      `${explanation(error)} ${draft ? `Draft ${draft.Id} and any copied attachments have been kept; its content may be incomplete.` : "A new draft may have been created even though its response was not received."} Reload and inspect the workspace before starting another copy.`,
      true,
      draft?.Id,
    );
  }
}
