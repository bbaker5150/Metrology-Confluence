import { useEffect, useMemo, useRef, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import type { Page, PageVersion } from "../types";
import { service } from "../services/sharepointService";
import { toMarkdown } from "../lib/content";
import { diffRevisionText } from "../lib/revisionDiff";
import Markdown from "./Markdown";
import Modal from "./Modal";

interface Props {
  page: Page;
  onClose: () => void;
  onRestored: (page: Page) => void;
  onBusyChange: (busy: boolean) => void;
}
const displayDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function VersionHistory({
  page,
  onClose,
  onRestored,
  onBusyChange,
}: Props) {
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"preview" | "compare">("preview");
  const [compareId, setCompareId] = useState("current");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryBlocked, setRetryBlocked] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void service
      .getVersions(page.Id)
      .then((items) => {
        if (!active) return;
        const sorted = [...items]
          .filter((item) => item.PageId === page.Id)
          .sort((a, b) => b.VersionNumber - a.VersionNumber);
        setVersions(sorted);
        setSelectedId(sorted[0]?.Id);
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Revision history could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page.Id]);
  const selected = versions.find((version) => version.Id === selectedId);
  const comparison = versions.find(
    (version) => String(version.Id) === compareId,
  );
  const targetTitle = comparison?.TitleSnapshot ?? page.Title;
  const targetContent = comparison?.ContentSnapshot ?? page.Content;
  const targetLabel = comparison
    ? `Version ${comparison.VersionNumber}`
    : "Current page";
  const diff = useMemo(
    () =>
      selected && mode === "compare"
        ? diffRevisionText(
            toMarkdown(selected.ContentSnapshot),
            toMarkdown(targetContent),
          )
        : null,
    [mode, selected, targetContent],
  );

  async function restore() {
    if (
      !selected ||
      pending.current ||
      retryBlocked ||
      page.Status === "Archived" ||
      selected.VersionNumber === page.VersionCount
    )
      return;
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      // The loaded page ETag must remain the revision baseline for this write.
      const updated = await service.restoreVersion(page, selected);
      onRestored(updated);
    } catch (failure) {
      setRetryBlocked(true);
      setError(
        `${failure instanceof Error ? failure.message : "The restore could not be confirmed."} Reload the latest page before attempting another restore.`,
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <Modal
      title="Version history"
      wide
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="version-layout" aria-busy={busy}>
        <div className="version-list" aria-label="Saved revisions">
          <p className="muted">
            Review saved snapshots or compare what changed. Restoring creates a
            new revision.
          </p>
          {loading && <p role="status">Loading versions…</p>}
          {!loading && !versions.length && (
            <p className="empty-inline">No revision snapshots are available.</p>
          )}
          {versions.map((version) => (
            <button
              type="button"
              className={`version-item ${selected?.Id === version.Id ? "active" : ""}`}
              key={version.Id}
              disabled={busy}
              aria-pressed={selected?.Id === version.Id}
              onClick={() => {
                setSelectedId(version.Id);
                setConfirming(false);
              }}
            >
              <strong>
                Version {version.VersionNumber}
                {version.VersionNumber === page.VersionCount
                  ? " · Current"
                  : ""}
              </strong>
              <span>{version.ChangeNote || "Page saved"}</span>
              <small>
                {version.EditedBy} · {displayDate(version.Created)}
              </small>
            </button>
          ))}
        </div>
        <div className="version-preview">
          {selected ? (
            <>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    VERSION {selected.VersionNumber}
                  </span>
                  <h3>{selected.TitleSnapshot}</h3>
                </div>
                <button
                  type="button"
                  className="button small"
                  title={
                    page.Status === "Archived"
                      ? "Restore this archived page before changing its content."
                      : undefined
                  }
                  disabled={
                    busy ||
                    retryBlocked ||
                    page.Status === "Archived" ||
                    selected.VersionNumber === page.VersionCount ||
                    confirming
                  }
                  onClick={() => setConfirming(true)}
                >
                  <RotateCcw size={14} />
                  Restore
                </button>
              </div>
              {confirming && (
                <section
                  className="version-restore-confirmation"
                  aria-label="Confirm version restore"
                >
                  <strong>Restore version {selected.VersionNumber}?</strong>
                  <p>
                    This replaces the current title and article content with
                    this snapshot. The page’s location, status, tags, and
                    attachments stay as they are.
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button small"
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      Cancel restore
                    </button>
                    <button
                      type="button"
                      className="button primary small"
                      disabled={busy || retryBlocked}
                      onClick={() => void restore()}
                    >
                      {busy ? "Restoring…" : "Restore version"}
                    </button>
                  </div>
                </section>
              )}
              <div className="version-tools">
                <div
                  className="reader-tabs"
                  role="tablist"
                  aria-label="Revision view"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "preview"}
                    disabled={busy}
                    onClick={() => setMode("preview")}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "compare"}
                    disabled={busy}
                    onClick={() => setMode("compare")}
                  >
                    Compare changes
                  </button>
                </div>
                {mode === "compare" && (
                  <label className="version-comparison-select">
                    Compare with
                    <select
                      aria-label="Compare with"
                      value={compareId}
                      disabled={busy}
                      onChange={(event) => setCompareId(event.target.value)}
                    >
                      <option value="current">Current page</option>
                      {versions.map((version) => (
                        <option key={version.Id} value={version.Id}>
                          Version {version.VersionNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {mode === "preview" ? (
                <div role="tabpanel" aria-label="Revision preview">
                  <Markdown
                    idPrefix="revision-"
                    content={selected.ContentSnapshot}
                  />
                </div>
              ) : (
                <section
                  className="revision-comparison"
                  role="tabpanel"
                  aria-label="Revision comparison"
                >
                  <p className="revision-comparison-direction">
                    Version {selected.VersionNumber}{" "}
                    <span aria-hidden="true">→</span>
                    <span className="visually-hidden">compared with</span>{" "}
                    {targetLabel}
                  </p>
                  {selected.TitleSnapshot !== targetTitle && (
                    <div className="revision-title-change">
                      <span>Title changed</span>
                      <del>{selected.TitleSnapshot}</del>
                      <ins>{targetTitle}</ins>
                    </div>
                  )}
                  {diff?.limited ? (
                    <div className="management-note" role="status">
                      {diff.message ||
                        "This comparison is too large to display. Preview each revision to review its content."}
                    </div>
                  ) : (
                    diff && (
                      <>
                        <div className="revision-diff-summary" role="status">
                          <span className="revision-added">
                            {diff.added} added{" "}
                            {diff.added === 1 ? "line" : "lines"}
                          </span>
                          <span className="revision-removed">
                            {diff.removed} removed{" "}
                            {diff.removed === 1 ? "line" : "lines"}
                          </span>
                        </div>
                        {!diff.added && !diff.removed ? (
                          <p className="empty-inline">
                            The article text is identical in these revisions.
                          </p>
                        ) : (
                          <div
                            className="revision-diff"
                            aria-label="Article changes"
                          >
                            {diff.rows.map((row, index) => (
                              <div
                                className={`revision-diff-row ${row.kind}`}
                                key={index}
                              >
                                <span
                                  className="revision-line-number"
                                  aria-hidden="true"
                                >
                                  {row.beforeLine ?? ""}
                                </span>
                                <span
                                  className="revision-line-number"
                                  aria-hidden="true"
                                >
                                  {row.afterLine ?? ""}
                                </span>
                                <span
                                  className="revision-line-sign"
                                  aria-hidden="true"
                                >
                                  {row.kind === "added"
                                    ? "+"
                                    : row.kind === "removed"
                                      ? "−"
                                      : " "}
                                </span>
                                <span className="visually-hidden">
                                  {row.kind === "added"
                                    ? "Added: "
                                    : row.kind === "removed"
                                      ? "Removed: "
                                      : "Unchanged: "}
                                </span>
                                <code>{row.text || " "}</code>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )
                  )}
                  <p className="revision-comparison-note">
                    Text and formatting are compared as Markdown. Page settings
                    and attached files are not included.
                  </p>
                </section>
              )}
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
    </Modal>
  );
}
