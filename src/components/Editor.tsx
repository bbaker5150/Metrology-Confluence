import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  ListChecks,
  Table2,
  Code2,
  Link2,
  Image,
  MessageSquare,
  Eye,
  Save,
  Send,
} from "lucide-react";
import type { Page, Space } from "../types";
import Markdown from "./Markdown";
import Modal from "./Modal";

type Props = {
  page: Partial<Page>;
  spaces: Space[];
  pages?: Page[];
  onSave: (
    page: Partial<Page> & Pick<Page, "Title" | "SpaceId" | "Content">,
    changeNote: string,
  ) => Promise<void>;
  onCancel: () => void;
};
const templates: Record<string, { title: string; body: string }> = {
  blank: { title: "Blank page", body: "" },
  sop: {
    title: "SOP / Runbook",
    body: "## Purpose\n\nDescribe the outcome and when to use this procedure.\n\n## Scope & prerequisites\n\n- Required equipment:\n- Responsible owner:\n\n> [!WARNING]\n> Confirm equipment is safe and within its calibration interval before proceeding.\n\n## Procedure\n\n1. Prepare the work area.\n2. Verify the reference standard.\n3. Perform and document the measurement.\n\n## Acceptance criteria\n\n| Check | Requirement | Result |\n| --- | --- | --- |\n| Reference validity | In date | Pending |\n\n## Records & review\n\n- [ ] Save the measurement record\n- [ ] Request an independent review\n",
  },
  troubleshooting: {
    title: "Troubleshooting & root cause",
    body: "## Symptoms\n\nDescribe the observed behavior and impact.\n\n## Initial checks\n\n- [ ] Record equipment identity and configuration\n- [ ] Confirm the reference and environment\n\n## Diagnosis\n\n| Observation | Possible cause | Next check |\n| --- | --- | --- |\n| Unexpected result | To investigate | Repeat independently |\n\n## Root cause\n\nDocument evidence supporting the cause.\n\n> [!TIP]\n> Change one variable at a time and record each result.\n\n## Resolution & prevention\n\n1. Apply the verified correction.\n2. Confirm the original symptom is resolved.\n",
  },
  project: {
    title: "Project / architecture overview",
    body: "## Overview\n\nExplain the problem, goals, and intended users.\n\n## Scope\n\n### In scope\n\n- Deliverable\n\n### Out of scope\n\n- Deferred work\n\n## Architecture\n\nDescribe the components and their interfaces.\n\n> [!DECISION]\n> Record an architecture decision and its rationale.\n\n## Milestones\n\n| Milestone | Owner | Target |\n| --- | --- | --- |\n| Design review | Unassigned | TBD |\n\n## Risks & open questions\n\n- [ ] Resolve the outstanding dependency\n",
  },
  meeting: {
    title: "Meeting notes & action items",
    body: "## Meeting details\n\n**Date:** \n\n**Participants:** \n\n## Agenda\n\n1. Progress since last meeting\n2. Decisions and blockers\n3. Next steps\n\n## Discussion\n\nCapture the key context.\n\n> [!DECISION]\n> Summarize the agreed decision.\n\n## Action items\n\n- [ ] Action — owner — due date\n\n## Next meeting\n\nDate and proposed topics.\n",
  },
};
export default function Editor({
  page,
  spaces,
  pages = [],
  onSave,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(page.Title || "");
  const [content, setContent] = useState(page.Content || "");
  const [summary, setSummary] = useState(page.Summary || "");
  const [tags, setTags] = useState(page.Tags?.join(", ") || "");
  const [spaceId, setSpaceId] = useState(page.SpaceId || spaces[0]?.Id || 0);
  const [template, setTemplate] = useState(page.TemplateType || "blank");
  const [parentId, setParentId] = useState<number | null>(
    page.ParentPageId ?? null,
  );
  const descendants = new Set<number>(page.Id ? [page.Id] : []);
  for (let changed = true; changed;) {
    changed = false;
    for (const candidate of pages) {
      if (
        candidate.ParentPageId &&
        descendants.has(candidate.ParentPageId) &&
        !descendants.has(candidate.Id)
      ) {
        descendants.add(candidate.Id);
        changed = true;
      }
    }
  }
  const hasChildren = Boolean(
    page.Id && pages.some((candidate) => candidate.ParentPageId === page.Id),
  );
  const [changeNote, setChangeNote] = useState("");
  const [preview, setPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dirty =
    title !== (page.Title || "") ||
    content !== (page.Content || "") ||
    summary !== (page.Summary || "") ||
    tags !== (page.Tags?.join(", ") || "") ||
    spaceId !== (page.SpaceId || spaces[0]?.Id || 0) ||
    parentId !== (page.ParentPageId ?? null) ||
    template !== (page.TemplateType || "blank") ||
    Boolean(changeNote);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function insert(before: string, after = "", placeholder = "text") {
    const field = textarea.current;
    const start = field?.selectionStart ?? content.length;
    const end = field?.selectionEnd ?? start;
    const selected = content.slice(start, end) || placeholder;
    setContent(
      content.slice(0, start) + before + selected + after + content.slice(end),
    );
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
  }
  function chooseTemplate(value: string) {
    if (
      content &&
      !window.confirm("Replace the current body with this template?")
    )
      return;
    setTemplate(value);
    setContent(templates[value].body);
  }
  function close() {
    if (!busy && (!dirty || window.confirm("Discard your unsaved changes?")))
      onCancel();
  }
  async function save(status: Page["Status"]) {
    if (!title.trim() || !spaceId) {
      setError("Enter a page title and choose a space.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(
        {
          ...page,
          Title: title.trim(),
          SpaceId: spaceId,
          Content: content,
          Summary: summary.trim(),
          Tags: [
            ...new Set(
              tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            ),
          ],
          Status: status,
          TemplateType: template,
          ParentPageId: parentId,
        },
        changeNote.trim(),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The page could not be saved. Your edits are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={page.Id ? "Edit article" : "Create article"}
      wide
      onClose={close}
    >
      <section className="editor-view">
        <div className="editor-heading">
          <div>
            <span className="eyebrow">
              {page.Id ? "EDIT ARTICLE" : "CREATE ARTICLE"}
            </span>
            <h1>
              {page.Id ? "Make knowledge better." : "Share what you know."}
            </h1>
            <p className="muted">
              Write in Markdown. Preview exactly what your team will read.
            </p>
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <fieldset
          disabled={busy}
          style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
        >
          <div className="editor-fields">
            <label>
              Title
              <input
                autoFocus
                maxLength={255}
                placeholder="Give this page a clear title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                Space
                <select
                  disabled={hasChildren}
                  value={spaceId}
                  onChange={(e) => {
                    setSpaceId(Number(e.target.value));
                    setParentId(null);
                  }}
                >
                  {spaces
                    .filter((s) => !s.IsArchived)
                    .map((s) => (
                      <option key={s.Id} value={s.Id}>
                        {s.Title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Starter template
                <select
                  value={template in templates ? template : "blank"}
                  onChange={(e) => chooseTemplate(e.target.value)}
                >
                  {Object.entries(templates).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {hasChildren && (
              <p className="muted">
                This page has children. Its space stays fixed to keep the
                hierarchy together.
              </p>
            )}
            <label>
              Parent page
              <select
                value={parentId ?? ""}
                onChange={(e) =>
                  setParentId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">None — top-level page</option>
                {pages
                  .filter(
                    (candidate) =>
                      candidate.SpaceId === spaceId &&
                      candidate.Status !== "Archived" &&
                      !descendants.has(candidate.Id),
                  )
                  .map((candidate) => (
                    <option key={candidate.Id} value={candidate.Id}>
                      {candidate.Title}
                    </option>
                  ))}
                {parentId &&
                  !pages.some((candidate) => candidate.Id === parentId) && (
                    <option value={parentId}>Article #{parentId}</option>
                  )}
              </select>
            </label>
            <label>
              Summary
              <input
                placeholder="A short description for search and discovery"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>
            <label>
              Tags
              <input
                maxLength={230}
                placeholder="calibration, procedures, onboarding"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </label>
          </div>
          <div className="editor-surface">
            <div
              className="editor-toolbar"
              role="toolbar"
              aria-label="Markdown formatting"
            >
              <button
                type="button"
                title="Heading"
                aria-label="Insert heading"
                onClick={() => insert("\n## ", "\n", "Heading")}
              >
                <Heading2 size={17} />
              </button>
              <button
                type="button"
                title="Bold"
                aria-label="Bold"
                onClick={() => insert("**", "**")}
              >
                <Bold size={17} />
              </button>
              <button
                type="button"
                title="Italic"
                aria-label="Italic"
                onClick={() => insert("*", "*")}
              >
                <Italic size={17} />
              </button>
              <button
                type="button"
                title="Checklist"
                aria-label="Insert checklist"
                onClick={() => insert("\n- [ ] ", "\n", "Action item")}
              >
                <ListChecks size={17} />
              </button>
              <button
                type="button"
                title="Table"
                aria-label="Insert table"
                onClick={() =>
                  insert(
                    "\n",
                    "\n",
                    "| Column | Column |\n| --- | --- |\n| Value | Value |",
                  )
                }
              >
                <Table2 size={17} />
              </button>
              <button
                type="button"
                title="Code block"
                aria-label="Insert code block"
                onClick={() => insert("\n```text\n", "\n```\n", "code")}
              >
                <Code2 size={17} />
              </button>
              <button
                type="button"
                title="Link"
                aria-label="Insert link"
                onClick={() =>
                  insert("[", "](https://example.com)", "Link text")
                }
              >
                <Link2 size={17} />
              </button>
              <button
                type="button"
                title="Image"
                aria-label="Insert image"
                onClick={() =>
                  insert(
                    "![",
                    "](/sites/team/SiteAssets/image.png)",
                    "Image description",
                  )
                }
              >
                <Image size={17} />
              </button>
              <label className="toolbar-select">
                <MessageSquare size={16} />
                <select
                  aria-label="Insert callout"
                  value=""
                  onChange={(e) => {
                    if (e.target.value)
                      insert(
                        `\n> [!${e.target.value}]\n> `,
                        "\n",
                        "Add context here.",
                      );
                  }}
                >
                  <option value="">Callout</option>
                  {["INFO", "TIP", "WARNING", "DECISION"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <button
                className={`preview-toggle ${preview ? "active" : ""}`}
                type="button"
                onClick={() => setPreview(!preview)}
                aria-pressed={preview}
              >
                <Eye size={16} /> Preview
              </button>
            </div>
            <div className={`editor-panels ${preview ? "split" : ""}`}>
              <textarea
                ref={textarea}
                aria-label="Article Markdown"
                spellCheck
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Start writing, or choose a starter template…"
              />
              {preview && (
                <div className="editor-preview">
                  <span className="eyebrow">LIVE PREVIEW</span>
                  <Markdown
                    idPrefix="editor-"
                    content={
                      content || "*Your article preview will appear here.*"
                    }
                  />
                </div>
              )}
            </div>
          </div>
          <p className="editor-hint muted">
            Use Markdown for headings, links, tables and tasks. Save the page to
            upload attachments; use an attachment’s “Copy image Markdown” action
            to insert it here.
          </p>
          <div className="editor-footer">
            <label>
              Change note <span className="muted">(optional)</span>
              <input
                maxLength={255}
                placeholder="What changed in this revision?"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                className="button"
                disabled={busy}
                onClick={() => save("Draft")}
              >
                <Save size={16} />
                {busy ? "Saving…" : "Save draft"}
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => save("Published")}
              >
                <Send size={16} />
                {busy ? "Saving…" : "Publish page"}
              </button>
            </div>
          </div>
        </fieldset>
      </section>
    </Modal>
  );
}
