import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Clock3,
  Download,
  Edit3,
  File,
  History,
  Link2,
  MessageSquare,
  Paperclip,
  Pin,
  Printer,
  RotateCcw,
  Archive,
  Bookmark,
  BookmarkCheck,
  Copy,
  FolderInput,
  Send,
  Upload,
  MoreHorizontal,
  ChevronDown,
  Link as LinkIcon,
  Trash2,
} from "lucide-react";
import type { Attachment, Comment, Page, Space } from "../types";
import { PageDeletionError, service } from "../services/sharepointService";
import Markdown, { extractHeadings, type Heading } from "./Markdown";
import Modal from "./Modal";
import { contentText, toMarkdown } from "../lib/content";
import PageManagementDialog, {
  type PageManagementAction,
} from "./PageManagementDialog";
import VersionHistory from "./VersionHistory";
import ConnectedPages from "./ConnectedPages";

type Props = {
  page: Page;
  spaces: Space[];
  pages: Page[];
  onNavigate: (id: number) => void;
  onSpace?: (id: number) => void;
  onEdit: () => void;
  onChanged: (page: Page) => void;
  onDeleted: (page: Page) => void;
  onToast: (message: string) => void;
  onDuplicateCreated: (page: Page) => void;
  saved: boolean;
  savedAvailable: boolean;
  onToggleSaved: () => void;
  onBusyChange: (busy: boolean) => void;
};
function relative(value: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86400000),
  );
  return days === 0
    ? "today"
    : days === 1
      ? "yesterday"
      : days < 30
        ? `${days} days ago`
        : new Date(value).toLocaleDateString();
}
function date(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function isImage(attachment: Attachment) {
  return /\.(png|jpe?g|gif|webp)$/i.test(attachment.FileName);
}
function safeAttachment(url: string) {
  if (
    /^data:image\/(png|jpeg|gif|webp);base64,/i.test(url) ||
    /^data:(application\/(octet-stream|pdf)|text\/plain);base64,/i.test(url)
  )
    return url;
  try {
    const parsed = new URL(url, window.location.href);
    return ["http:", "https:", "blob:"].includes(parsed.protocol)
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}
export default function ArticleReader({
  page,
  spaces,
  pages,
  onNavigate,
  onSpace,
  onEdit,
  onChanged,
  onDeleted,
  onToast,
  onDuplicateCreated,
  saved,
  savedAvailable,
  onToggleSaved,
  onBusyChange,
}: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [managementAction, setManagementAction] =
    useState<PageManagementAction | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [activeHeading, setActiveHeading] = useState("");
  const [deletePermission, setDeletePermission] = useState<number | null>(null);
  const [deleteDialogPage, setDeleteDialogPage] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteRetryBlocked, setDeleteRetryBlocked] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const articleContent = useRef<HTMLDivElement>(null);
  const actionMenu = useRef<HTMLDetailsElement>(null);
  const commentPending = useRef(false);
  const deletePending = useRef(false);
  const currentPageId = useRef(page.Id);
  currentPageId.current = page.Id;
  const canDelete = deletePermission === page.Id;
  const archived = page.Status === "Archived";
  const working = busy || deleting || mutationBusy;
  useLayoutEffect(() => {
    onBusyChange(working);
  }, [working, onBusyChange]);
  useLayoutEffect(() => () => onBusyChange(false), [onBusyChange]);
  useEffect(() => {
    let active = true;
    setDeletePermission(null);
    setDeleteDialogPage(null);
    setDeleteError("");
    setDeleteRetryBlocked(false);
    setDeleting(false);
    // Only a fresh identity/AuthorId check may expose the destructive action.
    void service
      .canDeletePage(page.Id)
      .then((allowed) => {
        if (active && allowed) setDeletePermission(page.Id);
      })
      .catch(() => {
        // A failed identity check keeps the action hidden.
      });
    return () => {
      active = false;
    };
  }, [page.Id]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!actionMenu.current?.contains(event.target as Node))
        actionMenu.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const [headings, setHeadings] = useState<Heading[]>(() =>
    extractHeadings(page.Content),
  );
  useEffect(() => {
    setHeadings(
      Array.from(
        articleContent.current?.querySelectorAll<HTMLHeadingElement>(
          "h1,h2,h3",
        ) || [],
      ).map((element) => ({
        id: element.id,
        text: element.textContent || "",
        level: Number(element.tagName[1]),
      })),
    );
  }, [page.Content]);
  const space = spaces.find((s) => s.Id === page.SpaceId);
  const ancestors = useMemo(() => {
    const result: Page[] = [];
    const seen = new Set([page.Id]);
    let id = page.ParentPageId;
    while (id && !seen.has(id)) {
      seen.add(id);
      const parent = pages.find((p) => p.Id === id);
      if (!parent) break;
      result.unshift(parent);
      id = parent.ParentPageId;
    }
    return result;
  }, [page, pages]);
  const childPageCount = pages.filter((p) => p.ParentPageId === page.Id).length;
  const readingMinutes = Math.max(
    1,
    Math.ceil(contentText(page.Content).split(/\s+/).length / 220),
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setComment("");
    setHistoryOpen(false);
    setComments([]);
    setAttachments([]);
    Promise.all([service.getComments(page.Id), service.getAttachments(page.Id)])
      .then(([c, a]) => {
        if (active) {
          setComments(c);
          setAttachments(a);
          setAttachmentsOpen(a.length > 0);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to load page details.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page.Id, page.VersionCount]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveHeading(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    headings.forEach((heading) => {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [headings]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function postComment() {
    const body = comment.trim();
    if (working || archived || commentPending.current || !body) return;
    commentPending.current = true;
    try {
      await run(async () => {
        const added = await service.addComment(page.Id, body);
        setComments((current) => [...current, added]);
        setComment("");
        onToast("Comment added.");
      });
    } finally {
      commentPending.current = false;
    }
  }
  async function deleteCurrentPage() {
    if (
      !canDelete ||
      deleteDialogPage !== page.Id ||
      childPageCount > 0 ||
      deleteRetryBlocked ||
      busy ||
      deletePending.current
    )
      return;
    const deletedPage = page;
    deletePending.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      // The service rechecks both the creator and all children before deleting.
      await service.deletePage(deletedPage.Id);
      if (currentPageId.current !== deletedPage.Id) return;
      setDeleteDialogPage(null);
      setDeletePermission(null);
      onDeleted(deletedPage);
      onToast(
        service.mode === "sharepoint"
          ? "Page moved to the SharePoint recycle bin."
          : "Page deleted.",
      );
    } catch (error) {
      if (currentPageId.current !== deletedPage.Id) return;
      setDeleteError(
        error instanceof Error
          ? error.message
          : "The page could not be deleted.",
      );
      setDeleteRetryBlocked(
        error instanceof PageDeletionError && error.retryBlocked,
      );
    } finally {
      deletePending.current = false;
      if (currentPageId.current === deletedPage.Id) setDeleting(false);
    }
  }
  function exportMarkdown() {
    const blob = new Blob(
      [`# ${page.Title}\n\n${toMarkdown(page.Content)}\n`],
      {
        type: "text/markdown;charset=utf-8",
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${page.Title.replace(/[^a-z0-9_-]/gi, "-").slice(0, 100) || "article"}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyImage(attachment: Attachment) {
    try {
      const url = safeAttachment(attachment.ServerRelativeUrl);
      if (!url) throw new Error("Unsupported image URL.");
      await navigator.clipboard.writeText(url);
      onToast("Image link copied. Use Insert image in the editor to add it.");
    } catch {
      onToast(
        "Could not copy automatically. Open the attachment and copy its URL.",
      );
    }
  }
  return (
    <article className="article-view">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        {space && onSpace ? (
          <button type="button" onClick={() => onSpace(space.Id)}>
            {space.Title}
          </button>
        ) : (
          <span>{space?.Title || "Space"}</span>
        )}
        {ancestors.map((parent) => (
          <span key={parent.Id}>
            <ChevronRight size={13} />
            <button type="button" onClick={() => onNavigate(parent.Id)}>
              {parent.Title}
            </button>
          </span>
        ))}
        <ChevronRight size={13} />
        <span aria-current="page">{page.Title}</span>
      </nav>
      <header className="article-header">
        <div className="article-topline">
          <div className="article-overline">
            <span
              className={`status-badge status-${page.Status.toLowerCase()}`}
            >
              {page.Status}
            </span>
            <span className="article-kind">
              {page.TemplateType === "sop"
                ? "Operating procedure"
                : "Knowledge article"}
            </span>
          </div>
          <div className="reader-actions">
            <button
              type="button"
              className={`icon-button ${page.IsPinned ? "active" : ""}`}
              aria-label={page.IsPinned ? "Unpin page" : "Pin page"}
              title={page.IsPinned ? "Unpin page" : "Pin page"}
              disabled={working || archived}
              onClick={() =>
                run(async () => {
                  const updated = await service.savePage(
                    { ...page, IsPinned: !page.IsPinned },
                    page.IsPinned ? "Unpinned page" : "Pinned page",
                  );
                  onChanged(updated);
                  onToast(
                    updated.IsPinned
                      ? "Page pinned for the team."
                      : "Page unpinned.",
                  );
                })
              }
            >
              <Pin size={17} />
            </button>
            <details
              ref={actionMenu}
              className="reader-menu"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.removeAttribute("open");
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary
                aria-label="More page actions"
                title="More page actions"
                className="icon-button"
              >
                <MoreHorizontal size={20} />
              </summary>
              <div
                className="reader-menu-items"
                role="group"
                aria-label="Page actions"
                onClick={(event) => {
                  const details = event.currentTarget.closest("details");
                  details?.removeAttribute("open");
                  details?.querySelector("summary")?.focus();
                }}
              >
                <button
                  type="button"
                  disabled={working || !savedAvailable}
                  aria-pressed={saved}
                  onClick={onToggleSaved}
                >
                  {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                  {saved ? "Remove from saved pages" : "Save for later"}
                </button>
                <div className="reader-menu-divider" />
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setManagementAction("duplicate")}
                >
                  <Copy size={16} />
                  Duplicate page
                </button>
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setManagementAction("move")}
                >
                  <FolderInput size={16} />
                  Move page
                </button>
                <button
                  type="button"
                  disabled={working}
                  onClick={() =>
                    setManagementAction(archived ? "restore" : "archive")
                  }
                >
                  {archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                  {archived ? "Restore archived page" : "Archive page"}
                </button>
                <div className="reader-menu-divider" />
                <button
                  type="button"
                  disabled={working}
                  onClick={() => {
                    setHistoryOpen(true);
                  }}
                >
                  <History size={16} />
                  Version history
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(location.href);
                      onToast("Page link copied.");
                    } catch {
                      onToast(
                        "Copy the page address from your browser to share it.",
                      );
                    }
                  }}
                >
                  <LinkIcon size={16} />
                  Copy page link
                </button>
                <div className="reader-menu-divider" />
                <button type="button" onClick={exportMarkdown}>
                  <Download size={16} />
                  Download Markdown
                </button>
                <button type="button" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print or save PDF
                </button>
                {canDelete && (
                  <>
                    <div className="reader-menu-divider" />
                    <button
                      type="button"
                      className="reader-delete-action"
                      disabled={working}
                      onClick={() => setDeleteDialogPage(page.Id)}
                    >
                      <Trash2 size={16} />
                      Delete page
                    </button>
                  </>
                )}
              </div>
            </details>
            <button
              type="button"
              className="button primary"
              disabled={working || archived}
              onClick={onEdit}
            >
              <Edit3 size={15} />
              Edit page
            </button>
          </div>
        </div>
        <h1>{page.Title}</h1>
        {page.Summary && <p className="article-summary">{page.Summary}</p>}
        <div className="article-metadata">
          <span className="avatar">
            {page.AuthorName.split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span>
            By <strong>{page.AuthorName}</strong>
            <small>
              {page.LastEditorName === page.AuthorName
                ? "Updated "
                : `Edited by ${page.LastEditorName} · `}
              <time dateTime={page.Modified} title={date(page.Modified)}>
                {relative(page.Modified)}
              </time>
            </small>
          </span>
          <span>
            <Clock3 size={14} />
            {readingMinutes} min read
          </span>
          <span className="version-badge" title="Revision number">
            Version {page.VersionCount}
          </span>
        </div>
        {page.Tags.length > 0 && (
          <div className="tag-row article-tag-row">
            {page.Tags.map((tag) => (
              <span className="tag" key={tag}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </header>
      {archived && (
        <div className="archived-page-notice">
          <Archive size={17} />
          <span>
            This page is archived. Use{" "}
            <strong>More page actions → Restore archived page</strong> to
            continue editing.
          </span>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="reader-layout">
        <div className="reader-main">
          <div className="article-content" ref={articleContent}>
            <Markdown
              content={page.Content || "*This page has no content yet.*"}
            />
          </div>
          <ConnectedPages
            page={page}
            pages={pages}
            spaces={spaces}
            onNavigate={onNavigate}
          />
          <section className="attachments-section">
            <div className="section-heading">
              <button
                type="button"
                className="attachment-disclosure"
                aria-expanded={attachmentsOpen}
                onClick={() => setAttachmentsOpen(!attachmentsOpen)}
              >
                <Paperclip size={17} />
                Attachments <span className="count">{attachments.length}</span>
                <ChevronDown size={15} />
              </button>
              <button
                type="button"
                className="button small"
                disabled={working || loading || archived}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={15} />
                {busy ? "Working…" : "Upload file"}
              </button>
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                multiple
                disabled={working || archived}
                aria-label="Upload attachments"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length || working || archived) return;
                  void run(async () => {
                    for (const file of files) {
                      await service.uploadAttachment(page.Id, file);
                      setAttachments(await service.getAttachments(page.Id));
                      setAttachmentsOpen(true);
                    }
                    onToast(
                      `${files.length} attachment${files.length === 1 ? "" : "s"} uploaded.`,
                    );
                  });
                  e.target.value = "";
                }}
              />
            </div>
            {attachmentsOpen &&
              (loading ? (
                <p className="muted">Loading attachments…</p>
              ) : attachments.length ? (
                <div className="attachment-grid">
                  {attachments.map((attachment) => (
                    <div className="attachment-card" key={attachment.FileName}>
                      {isImage(attachment) &&
                      safeAttachment(attachment.ServerRelativeUrl) ? (
                        <a
                          href={safeAttachment(attachment.ServerRelativeUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={safeAttachment(attachment.ServerRelativeUrl)}
                            alt={attachment.FileName}
                            loading="lazy"
                          />
                        </a>
                      ) : (
                        <File size={24} />
                      )}
                      <a
                        href={safeAttachment(attachment.ServerRelativeUrl)}
                        download={attachment.FileName}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {attachment.FileName}
                        <Download size={13} />
                      </a>
                      {attachment.Size != null && (
                        <small className="muted">
                          {Math.ceil(attachment.Size / 1024)} KB
                        </small>
                      )}
                      {isImage(attachment) && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => copyImage(attachment)}
                        >
                          <Link2 size={12} />
                          Copy image link
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-inline">
                  {archived
                    ? "No files were attached to this page."
                    : "Add reference files, diagrams, or supporting images to this page."}
                </p>
              ))}
          </section>
          <section className="comments-section">
            <h2>
              <MessageSquare size={19} />
              Discussion <span className="count">{comments.length}</span>
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void postComment();
              }}
            >
              <label className="visually-hidden" htmlFor="page-comment">
                Add a comment
              </label>
              <textarea
                id="page-comment"
                readOnly={working || archived}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  archived
                    ? "Restore this page to add a comment."
                    : "Add to the discussion…"
                }
                rows={3}
                maxLength={10000}
              />
              <button
                type="button"
                className="button primary small"
                disabled={working || archived || !comment.trim()}
                onClick={(event) => {
                  // Sandboxed SharePoint hosts may block native form submission.
                  event.preventDefault();
                  event.stopPropagation();
                  void postComment();
                }}
              >
                <Send size={14} />
                Post comment
              </button>
            </form>
            <div className="comment-feed">
              {comments.map((entry) => (
                <div className="comment" key={entry.Id}>
                  <span className="avatar">
                    {entry.AuthorName.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <div className="comment-meta">
                      <strong>{entry.AuthorName}</strong>
                      <time
                        dateTime={entry.Created}
                        title={date(entry.Created)}
                      >
                        {relative(entry.Created)}
                      </time>
                    </div>
                    <p>{entry.CommentBody}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="article-toc" aria-label="On this page">
          <span className="eyebrow">ON THIS PAGE</span>
          {headings.length ? (
            <nav>
              {headings.map((heading) => (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  style={{ paddingLeft: `${(heading.level - 1) * 12 + 12}px` }}
                  className={activeHeading === heading.id ? "active" : ""}
                  aria-current={
                    activeHeading === heading.id ? "location" : undefined
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveHeading(heading.id);
                    const target = document.getElementById(heading.id);
                    for (
                      let ancestor = target?.parentElement;
                      ancestor;
                      ancestor = ancestor.parentElement
                    )
                      if (ancestor instanceof HTMLDetailsElement)
                        ancestor.open = true;
                    target?.scrollIntoView({
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "instant"
                        : "smooth",
                      block: "start",
                    });
                    target?.focus({ preventScroll: true });
                  }}
                >
                  {heading.text}
                </a>
              ))}
            </nav>
          ) : (
            <p className="muted">Headings will appear here.</p>
          )}
        </aside>
      </div>
      {deleteDialogPage === page.Id && (
        <Modal
          title="Delete page"
          onClose={() => {
            if (!deletePending.current) setDeleteDialogPage(null);
          }}
        >
          <div className="delete-page-confirmation" aria-busy={deleting}>
            <p className="delete-page-title">Delete “{page.Title}”?</p>
            <p>
              {service.mode === "sharepoint"
                ? "This page and its attachments will move to the SharePoint recycle bin. Revision history and discussion records are retained for a restored page."
                : "This page will be removed from this browser’s workspace. This demo has no undo or recycle bin."}
            </p>
            {childPageCount > 0 && (
              <div className="delete-page-children" role="status">
                Move or delete its {childPageCount} child{" "}
                {childPageCount === 1 ? "page" : "pages"} first, including any
                drafts or archived pages. Child pages are never deleted
                automatically.
              </div>
            )}
            {deleteError && (
              <div className="error-banner" role="alert">
                {deleteError}
              </div>
            )}
            <div className="delete-page-actions">
              <button
                type="button"
                className="button"
                disabled={deleting}
                onClick={() => setDeleteDialogPage(null)}
              >
                {deleteRetryBlocked ? "Close" : "Cancel"}
              </button>
              <button
                type="button"
                className="button delete-page-button"
                disabled={
                  deleting ||
                  busy ||
                  childPageCount > 0 ||
                  !canDelete ||
                  deleteRetryBlocked
                }
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void deleteCurrentPage();
                }}
              >
                <Trash2 size={15} />
                {deleting ? "Deleting…" : "Delete page"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {managementAction && (
        <PageManagementDialog
          action={managementAction}
          page={page}
          pages={pages}
          spaces={spaces}
          onClose={() => setManagementAction(null)}
          onChanged={onChanged}
          onDuplicateCreated={onDuplicateCreated}
          onNavigate={(id) => {
            onBusyChange(false);
            onNavigate(id);
          }}
          onToast={onToast}
          onBusyChange={setMutationBusy}
        />
      )}
      {historyOpen && (
        <VersionHistory
          page={page}
          onClose={() => setHistoryOpen(false)}
          onBusyChange={setMutationBusy}
          onRestored={(updated) => {
            onChanged(updated);
            setHistoryOpen(false);
            onToast("Previous version restored as a new revision.");
          }}
        />
      )}
    </article>
  );
}
