import { useEffect, useMemo, useRef, useState } from "react";
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
  Send,
  Upload,
} from "lucide-react";
import type { Attachment, Comment, Page, PageVersion, Space } from "../types";
import { service } from "../services/sharepointService";
import Markdown, { extractHeadings, type Heading } from "./Markdown";
import Modal from "./Modal";

type Props = {
  page: Page;
  spaces: Space[];
  pages: Page[];
  onNavigate: (id: number) => void;
  onEdit: () => void;
  onChanged: (page: Page) => void;
  onToast: (message: string) => void;
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
  onEdit,
  onChanged,
  onToast,
}: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [preview, setPreview] = useState<PageVersion | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeHeading, setActiveHeading] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const articleContent = useRef<HTMLDivElement>(null);
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
  const children = pages.filter(
    (p) => p.ParentPageId === page.Id && p.Status !== "Archived",
  );
  const readingMinutes = Math.max(
    1,
    Math.ceil(page.Content.trim().split(/\s+/).length / 220),
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setComment("");
    setHistoryOpen(false);
    setPreview(null);
    setComments([]);
    setAttachments([]);
    setVersions([]);
    Promise.all([
      service.getComments(page.Id),
      service.getAttachments(page.Id),
      service.getVersions(page.Id),
    ])
      .then(([c, a, v]) => {
        if (active) {
          setComments(c);
          setAttachments(a);
          setVersions(v);
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
  function exportMarkdown() {
    const blob = new Blob([`# ${page.Title}\n\n${page.Content}\n`], {
      type: "text/markdown;charset=utf-8",
    });
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
      await navigator.clipboard.writeText(
        `![${attachment.FileName.replace(/[\[\]]/g, "")}](<${url.replace(/>/g, "%3E")}>)`,
      );
      onToast("Image Markdown copied. Paste it in the editor.");
    } catch {
      onToast(
        "Could not copy automatically. Open the attachment and copy its URL.",
      );
    }
  }
  return (
    <article className="article-view">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <span>{space?.Title || "Space"}</span>
        {ancestors.map((parent) => (
          <span key={parent.Id}>
            <ChevronRight size={13} />
            <button onClick={() => onNavigate(parent.Id)}>
              {parent.Title}
            </button>
          </span>
        ))}
        <ChevronRight size={13} />
        <span aria-current="page">{page.Title}</span>
      </nav>
      <header className="article-header">
        <div className="article-overline">
          <span className={`status-badge status-${page.Status.toLowerCase()}`}>
            {page.Status}
          </span>
          <span className="eyebrow">
            {page.TemplateType === "sop"
              ? "STANDARD OPERATING PROCEDURE"
              : "KNOWLEDGE ARTICLE"}
          </span>
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
              Edited by {page.LastEditorName} ·{" "}
              <time dateTime={page.Modified} title={date(page.Modified)}>
                {relative(page.Modified)}
              </time>
            </small>
          </span>
          <span>
            <Clock3 size={14} />
            {readingMinutes} min read
          </span>
          <button
            className="version-badge"
            onClick={() => setHistoryOpen(true)}
          >
            v{page.VersionCount}
          </button>
        </div>
        <div className="article-controls">
          <div className="tag-row">
            {page.Tags.map((tag) => (
              <span className="tag" key={tag}>
                #{tag}
              </span>
            ))}
          </div>
          <div className="button-row">
            <button
              className={`icon-button ${page.IsPinned ? "active" : ""}`}
              aria-label={page.IsPinned ? "Unpin page" : "Pin page"}
              title={page.IsPinned ? "Unpin page" : "Pin page"}
              disabled={busy}
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
            <button
              className="icon-button"
              title="Version history"
              aria-label="Version history"
              onClick={() => setHistoryOpen(true)}
            >
              <History size={17} />
            </button>
            <button
              className="icon-button"
              title="Download Markdown"
              aria-label="Download Markdown"
              onClick={exportMarkdown}
            >
              <Download size={17} />
            </button>
            <button
              className="icon-button"
              title="Print or save PDF"
              aria-label="Print or save PDF"
              onClick={() => window.print()}
            >
              <Printer size={17} />
            </button>
            <button className="button primary" onClick={onEdit}>
              <Edit3 size={15} />
              Edit page
            </button>
          </div>
        </div>
      </header>
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
          {children.length > 0 && (
            <section className="child-pages">
              <h2>In this section</h2>
              {children.map((child) => (
                <button
                  className="child-page-link"
                  key={child.Id}
                  onClick={() => onNavigate(child.Id)}
                >
                  <File size={16} />
                  <span>{child.Title}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </section>
          )}
          <section className="attachments-section">
            <div className="section-heading">
              <h2>
                <Paperclip size={19} />
                Attachments <span className="count">{attachments.length}</span>
              </h2>
              <button
                className="button small"
                disabled={busy || loading}
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
                aria-label="Upload attachments"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  void run(async () => {
                    for (const file of files) {
                      await service.uploadAttachment(page.Id, file);
                      setAttachments(await service.getAttachments(page.Id));
                    }
                    onToast(
                      `${files.length} attachment${files.length === 1 ? "" : "s"} uploaded.`,
                    );
                  });
                  e.target.value = "";
                }}
              />
            </div>
            {loading ? (
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
                        className="text-button"
                        onClick={() => copyImage(attachment)}
                      >
                        <Link2 size={12} />
                        Copy image Markdown
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-inline">
                Add reference files, diagrams, or supporting images to this
                page.
              </p>
            )}
          </section>
          <section className="comments-section">
            <h2>
              <MessageSquare size={19} />
              Discussion <span className="count">{comments.length}</span>
            </h2>
            <p className="muted">
              Ask a question or add context for the next person.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (comment.trim())
                  void run(async () => {
                    const added = await service.addComment(
                      page.Id,
                      comment.trim(),
                    );
                    setComments([...comments, added]);
                    setComment("");
                    onToast("Comment added.");
                  });
              }}
            >
              <label className="visually-hidden" htmlFor="page-comment">
                Add a comment
              </label>
              <textarea
                id="page-comment"
                readOnly={busy}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add to the discussion…"
                rows={3}
                maxLength={10000}
              />
              <button
                className="button primary small"
                disabled={busy || !comment.trim()}
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
              {!loading && !comments.length && (
                <p className="empty-inline">
                  No comments yet. Start the conversation.
                </p>
              )}
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
          <div className="toc-footnote">
            <strong>Knowledge grows together.</strong>
            <p>
              Found something outdated?
              <br />
              Edit the page or leave a comment.
            </p>
          </div>
        </aside>
      </div>
      {historyOpen && (
        <Modal
          title="Version history"
          wide
          onClose={() => {
            if (!busy) {
              setHistoryOpen(false);
              setPreview(null);
            }
          }}
        >
          <div className="version-layout">
            <div className="version-list">
              <p className="muted">
                Every saved revision is a restore point. Restoring creates a new
                version.
              </p>
              {loading && <p>Loading versions…</p>}
              {!loading && !versions.length && (
                <p className="empty-inline">
                  No revision snapshots are available.
                </p>
              )}
              {[...versions]
                .sort((a, b) => b.VersionNumber - a.VersionNumber)
                .map((version) => (
                  <button
                    className={`version-item ${preview?.Id === version.Id ? "active" : ""}`}
                    key={version.Id}
                    onClick={() => setPreview(version)}
                  >
                    <strong>
                      Version {version.VersionNumber}
                      {version.VersionNumber === page.VersionCount
                        ? " · Current"
                        : ""}
                    </strong>
                    <span>{version.ChangeNote || "Page saved"}</span>
                    <small>
                      {version.EditedBy} · {date(version.Created)}
                    </small>
                  </button>
                ))}
            </div>
            <div className="version-preview">
              {preview ? (
                <>
                  <div className="section-heading">
                    <h3>{preview.TitleSnapshot}</h3>
                    <button
                      className="button small"
                      disabled={
                        busy || preview.VersionNumber === page.VersionCount
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            `Restore version ${preview.VersionNumber} as a new revision?`,
                          )
                        )
                          void run(async () => {
                            const updated = await service.restoreVersion(
                              page,
                              preview,
                            );
                            onChanged(updated);
                            setHistoryOpen(false);
                            setPreview(null);
                            onToast(
                              "Previous version restored as a new revision.",
                            );
                          });
                      }}
                    >
                      <RotateCcw size={14} />
                      Restore
                    </button>
                  </div>
                  <Markdown
                    idPrefix="revision-"
                    content={preview.ContentSnapshot}
                  />
                </>
              ) : (
                <div className="empty-state">
                  <History size={28} />
                  <h3>Select a revision</h3>
                  <p>Preview the article before restoring it.</p>
                </div>
              )}
            </div>
          </div>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </article>
  );
}
