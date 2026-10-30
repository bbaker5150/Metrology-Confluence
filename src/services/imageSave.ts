import type { Attachment, Page, PageInput, PendingImage } from "../types";
import { service } from "./sharepointService";

export interface ImageSaveStore {
  readonly mode: "local" | "sharepoint";
  getPages(): Promise<Page[]>;
  getAttachments(pageId: number): Promise<Attachment[]>;
  uploadAttachment(pageId: number, file: File): Promise<Attachment>;
  savePage(page: PageInput, changeNote?: string): Promise<Page>;
}

/** Keeps unsaved edits and successful uploads available to the editor after failure. */
export class ImageSaveError extends Error {
  constructor(
    message: string,
    public readonly page: PageInput,
    public readonly remainingImages: PendingImage[],
    public readonly retryBlocked = false,
  ) {
    super(message);
    this.name = "ImageSaveError";
  }
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const sourcePattern = (url: string) =>
  new RegExp(`\\bsrc=(['"])${escapePattern(url)}\\1`, "g");
const containsImage = (content: string, image: PendingImage) =>
  sourcePattern(image.previewUrl).test(content);
const hasTemporarySource = (content: string) =>
  /\bsrc\s*=\s*(['"])blob:/i.test(content);
const replaceSource = (content: string, before: string, after: string) =>
  content.replace(
    sourcePattern(before),
    () => `src="${escapeAttribute(after)}"`,
  );

/** Stable across retries, so a lost upload response never creates a second attachment. */
export function imageAttachmentName(image: PendingImage): string {
  const safeName = image.file.name.replace(/[^a-z0-9._-]+/gi, "-").slice(-72);
  return `mc-${image.id}-${safeName}`;
}

function validateImages(images: PendingImage[], mode: ImageSaveStore["mode"]) {
  const ids = new Set<string>();
  const previews = new Set<string>();
  const maxBytes = (mode === "local" ? 2 : 10) * 1024 * 1024;
  for (const image of images) {
    if (!/^[a-z0-9-]{8,40}$/i.test(image.id) || ids.has(image.id))
      throw new Error(
        "An image has an invalid upload identifier. Remove it and insert it again.",
      );
    ids.add(image.id);
    if (
      !/^blob:[^\s<>"']+$/.test(image.previewUrl) ||
      previews.has(image.previewUrl)
    )
      throw new Error(
        "An image has an invalid preview. Remove it and insert it again.",
      );
    previews.add(image.previewUrl);
    const extension = image.file.name
      .match(/\.([a-z0-9]+)$/i)?.[1]
      .toLowerCase();
    const allowed: Record<string, string[]> = {
      "image/png": ["png"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/gif": ["gif"],
      "image/webp": ["webp"],
    };
    if (!extension || !allowed[image.file.type]?.includes(extension))
      throw new Error(
        "Insert a PNG, JPEG, GIF, or WebP image. SVG and other active image formats are not supported.",
      );
    if (!image.file.size || image.file.size > maxBytes)
      throw new Error(
        `Images must be nonempty and ${maxBytes / 1024 / 1024} MB or smaller in ${mode} mode.`,
      );
  }
}

function withoutPendingImages(content: string) {
  return content.replace(
    /<img\b[^>]*\bsrc\s*=\s*(['"])blob:[^'"]*\1[^>]*>/gi,
    "<p><em>Image upload pending. Finish saving from the editor to insert this image.</em></p>",
  );
}

const comparedFields: (keyof Page)[] = [
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
  "AuthorName",
  "LastEditorName",
];
function isSameRevision(before: Page, after: Page) {
  // Attachment uploads may change native Modified/ETag values. Content and all
  // application-owned metadata must remain unchanged before accepting a new ETag.
  return comparedFields.every(
    (key) => JSON.stringify(before[key]) === JSON.stringify(after[key]),
  );
}
function requireBaseline(page: PageInput, pages: Page[]): Page {
  const current = pages.find((item) => item.Id === page.Id);
  if (!current)
    throw new Error("The page no longer exists. Reload before saving.");
  if (!page.etag || current.etag !== page.etag)
    throw new Error(
      "This page changed since you opened it. Reload before saving to protect the other editor’s work.",
    );
  return current;
}

/**
 * Saves images as attachments, then commits their permanent URLs in the article.
 * A new article first needs a Draft item ID; no blob URL is ever persisted.
 * No failed write is automatically repeated. Partial upload recovery is explicit.
 */
export async function savePageWithImages(
  input: PageInput,
  changeNote: string,
  stagedImages: PendingImage[] = [],
  store: ImageSaveStore = service,
): Promise<Page> {
  let working: PageInput = { ...input };
  let remaining = stagedImages.filter((image) =>
    containsImage(input.Content, image),
  );
  try {
    validateImages(remaining, store.mode);
    const unmatched = remaining.reduce(
      (html, image) => replaceSource(html, image.previewUrl, "pending-image"),
      input.Content,
    );
    if (hasTemporarySource(unmatched))
      throw new Error(
        "An image preview is no longer available for upload. Remove that image and insert it again before saving.",
      );
  } catch (error) {
    throw new ImageSaveError(messageOf(error), working, remaining);
  }
  if (!remaining.length) return store.savePage(input, changeNote);

  let baseline: Page;
  if (input.Id) {
    try {
      baseline = requireBaseline(input, await store.getPages());
    } catch (error) {
      throw new ImageSaveError(messageOf(error), working, remaining, true);
    }
  } else {
    try {
      baseline = await store.savePage(
        {
          ...input,
          Status: "Draft",
          Content: withoutPendingImages(input.Content),
        },
        "Draft created for image upload",
      );
      working = { ...working, Id: baseline.Id, etag: baseline.etag };
    } catch (error) {
      // savePage can fail after item creation (e.g. snapshot or response failure).
      // Without a returned item ID, retrying could create a duplicate draft.
      throw new ImageSaveError(
        `The initial draft could not be confirmed. A draft may already exist; reopen the workspace before retrying to avoid creating it twice. Your edits are still in this editor. ${messageOf(error)}`,
        working,
        remaining,
        true,
      );
    }
  }

  const refreshSafeEditToken = async () => {
    const current = (await store.getPages()).find(
      (item) => item.Id === baseline.Id,
    );
    if (!current || !isSameRevision(baseline, current))
      throw new Error(
        "Another editor changed this page while images were uploading. Your edits and uploaded files are preserved; reopen the latest page before saving.",
      );
    if (!current.etag)
      throw new Error(
        "The current page edit token is unavailable. Reload before saving.",
      );
    working.etag = current.etag;
  };

  try {
    const attached = await store.getAttachments(baseline.Id);
    for (const image of [...remaining]) {
      const name = imageAttachmentName(image);
      // Reconcile a previous upload whose response was lost; the random image ID
      // gives this file a stable, operation-specific name.
      const existing = attached.find((file) => file.FileName === name);
      const uploaded =
        existing ??
        (await store.uploadAttachment(
          baseline.Id,
          new File([image.file], name, {
            type: image.file.type,
            lastModified: image.file.lastModified,
          }),
        ));
      working.Content = replaceSource(
        working.Content,
        image.previewUrl,
        uploaded.ServerRelativeUrl,
      );
      remaining = remaining.filter((candidate) => candidate.id !== image.id);
      attached.push(uploaded);
    }
  } catch (error) {
    try {
      await refreshSafeEditToken();
    } catch (refreshError) {
      throw new ImageSaveError(
        `${messageOf(error)} ${messageOf(refreshError)}`,
        working,
        remaining,
        true,
      );
    }
    throw new ImageSaveError(
      `The page is saved as ${baseline.Status === "Draft" ? "a draft" : "its previous revision"}, but some images could not finish uploading. Your edits are retained; retry to finish. ${messageOf(error)}`,
      working,
      remaining,
    );
  }

  try {
    await refreshSafeEditToken();
  } catch (error) {
    throw new ImageSaveError(messageOf(error), working, remaining, true);
  }
  if (hasTemporarySource(working.Content))
    throw new ImageSaveError(
      "Some images still have temporary URLs. Reopen the editor and insert them again before saving.",
      working,
      remaining,
      true,
    );
  try {
    return await store.savePage(working, changeNote);
  } catch (error) {
    // The final write or its snapshot may have succeeded even when its response
    // failed. Keep the actual URLs and forbid blind duplicate revision writes.
    throw new ImageSaveError(
      `Images were attached, but the final page save could not be confirmed. Reopen the latest page before retrying; your edits are retained here. ${messageOf(error)}`,
      working,
      remaining,
      true,
    );
  }
}
