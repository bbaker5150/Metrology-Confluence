import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  EditorContent,
  useEditor,
  type Editor as TiptapEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Blockquote from "@tiptap/extension-blockquote";
import ImageExtension from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bold,
  FileEdit,
  Check,
  ChevronDown,
  Code2,
  ImagePlus,
  Info,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListChecks,
  Minus,
  MoreHorizontal,
  Plus,
  Redo2,
  Search,
  Settings2,
  Smile,
  Strikethrough,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import type {
  Attachment,
  Page,
  PageInput,
  PendingImage,
  Space,
} from "../types";
import { service } from "../services/sharepointService";
import { ImageSaveError } from "../services/imageSave";
import {
  contentText,
  safeContentUrl,
  serializeContent,
  toEditorHTML,
  toMarkdown,
} from "../lib/content";
import Modal from "./Modal";

type Props = {
  page: Partial<Page>;
  spaces: Space[];
  pages?: Page[];
  onSave: (
    page: PageInput,
    changeNote: string,
    images?: PendingImage[],
  ) => Promise<void>;
  onCancel: () => void;
  onStateChange: (state: { dirty: boolean; busy: boolean }) => void;
};
type Panel = "insert" | "symbol" | "image" | "link" | "more" | null;
const templates: Record<string, { title: string; body: string }> = {
  blank: { title: "Blank page", body: "" },
  sop: {
    title: "SOP / Runbook",
    body: "## Purpose\n\nDescribe the outcome and when to use this procedure.\n\n## Scope & prerequisites\n\n- Required equipment\n- Responsible owner\n\n> [!WARNING]\n> Confirm equipment is safe and within its calibration interval before proceeding.\n\n## Procedure\n\n1. Prepare the work area.\n2. Verify the reference standard.\n3. Perform and document the measurement.\n\n## Acceptance criteria\n\n| Check | Requirement | Result |\n| --- | --- | --- |\n| Reference validity | In date | Pending |\n\n## Records & review\n\n- [ ] Save the measurement record\n- [ ] Request an independent review",
  },
  troubleshooting: {
    title: "Troubleshooting & root cause",
    body: "## Symptoms\n\nDescribe the observed behavior and impact.\n\n## Initial checks\n\n- [ ] Record equipment identity and configuration\n- [ ] Confirm the reference and environment\n\n## Diagnosis\n\n| Observation | Possible cause | Next check |\n| --- | --- | --- |\n| Unexpected result | To investigate | Repeat independently |\n\n## Root cause\n\nDocument the evidence supporting the cause.\n\n> [!TIP]\n> Change one variable at a time and record each result.\n\n## Resolution & prevention\n\n1. Apply the verified correction.\n2. Confirm the original symptom is resolved.",
  },
  project: {
    title: "Project / architecture overview",
    body: "## Overview\n\nExplain the problem, goals, and intended users.\n\n## Scope\n\n### In scope\n\n- Deliverable\n\n### Out of scope\n\n- Deferred work\n\n## Architecture\n\nDescribe the components and their interfaces.\n\n> [!DECISION]\n> Record an architecture decision and its rationale.\n\n## Milestones\n\n| Milestone | Owner | Target |\n| --- | --- | --- |\n| Design review | Unassigned | TBD |\n\n## Risks & open questions\n\n- [ ] Resolve the outstanding dependency",
  },
  meeting: {
    title: "Meeting notes & action items",
    body: "## Meeting details\n\n**Date:**\n\n**Participants:**\n\n## Agenda\n\n1. Progress since last meeting\n2. Decisions and blockers\n3. Next steps\n\n## Discussion\n\nCapture the key context.\n\n> [!DECISION]\n> Summarize the agreed decision.\n\n## Action items\n\n- [ ] Action — owner — due date\n\n## Next meeting\n\nDate and proposed topics.",
  },
};
const symbols = [
  ["±", "Plus or minus", "Measurement"],
  ["µ", "Micro mu", "Measurement"],
  ["Ω", "Ohm omega", "Measurement"],
  ["°", "Degree", "Measurement"],
  ["Δ", "Delta change", "Measurement"],
  ["σ", "Sigma standard deviation", "Measurement"],
  ["Σ", "Sum sigma", "Measurement"],
  ["λ", "Lambda wavelength", "Measurement"],
  ["π", "Pi", "Measurement"],
  ["ρ", "Rho density", "Measurement"],
  ["τ", "Tau time constant", "Measurement"],
  ["α", "Alpha", "Measurement"],
  ["β", "Beta", "Measurement"],
  ["θ", "Theta angle", "Measurement"],
  ["φ", "Phi phase", "Measurement"],
  ["ε", "Epsilon error", "Measurement"],
  ["≤", "Less than or equal", "Math"],
  ["≥", "Greater than or equal", "Math"],
  ["≠", "Not equal", "Math"],
  ["≈", "Approximately equal", "Math"],
  ["∞", "Infinity", "Math"],
  ["√", "Square root", "Math"],
  ["×", "Multiply", "Math"],
  ["÷", "Divide", "Math"],
  ["∫", "Integral", "Math"],
  ["∂", "Partial derivative", "Math"],
  ["²", "Squared", "Math"],
  ["³", "Cubed", "Math"],
  ["→", "Right arrow", "Math"],
  ["↔", "Bidirectional arrow", "Math"],
  ["✅", "Check complete", "Emoji"],
  ["⚠️", "Warning caution", "Emoji"],
  ["💡", "Idea tip", "Emoji"],
  ["📌", "Pin important", "Emoji"],
  ["🔬", "Microscope lab", "Emoji"],
  ["🧪", "Test tube", "Emoji"],
  ["📋", "Clipboard checklist", "Emoji"],
  ["🔧", "Wrench repair", "Emoji"],
  ["🎯", "Target goal", "Emoji"],
  ["🚀", "Rocket launch", "Emoji"],
  ["📎", "Attachment paperclip", "Emoji"],
  ["📝", "Notes memo", "Emoji"],
];
const languages = [
  ["text", "Plain text"],
  ["python", "Python"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["json", "JSON"],
  ["bash", "Shell"],
  ["powershell", "PowerShell"],
  ["sql", "SQL"],
  ["xml", "HTML / XML"],
  ["css", "CSS"],
  ["c", "C"],
  ["cpp", "C++"],
];
const Callout = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      callout: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-callout"),
        renderHTML: (attrs) =>
          attrs.callout ? { "data-callout": attrs.callout } : {},
      },
    };
  },
});
const ResizableImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("width") || "100%",
        renderHTML: (attrs) => ({ width: attrs.width }),
      },
    };
  },
});
const canImage = (file: File) => /^image\/(png|jpeg|gif|webp)$/.test(file.type);

function Tool({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
  locked = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      className={`rich-tool ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled || locked}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function Editor({
  page,
  spaces,
  pages = [],
  onSave,
  onCancel,
  onStateChange,
}: Props) {
  const [basePage, setBasePage] = useState(page),
    [title, setTitle] = useState(page.Title || ""),
    [spaceId, setSpaceId] = useState(page.SpaceId || spaces[0]?.Id || 0),
    [parentId, setParentId] = useState<number | null>(
      page.ParentPageId ?? null,
    );
  const [summary, setSummary] = useState(page.Summary || ""),
    [tags, setTags] = useState(page.Tags?.join(", ") || ""),
    [changeNote, setChangeNote] = useState(""),
    [template, setTemplate] = useState(page.TemplateType || "blank"),
    [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false),
    [retryBlocked, setRetryBlocked] = useState(false),
    [error, setError] = useState(""),
    [changed, setChanged] = useState(false),
    [panel, setPanel] = useState<Panel>(null),
    [query, setQuery] = useState(""),
    [menuIndex, setMenuIndex] = useState(0),
    [pending, setPending] = useState<PendingImage[]>([]);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    actionLabel: string;
    action: () => void;
  } | null>(null);
  const [sourceMode, setSourceMode] = useState(false),
    [source, setSource] = useState(""),
    [, setTick] = useState(0),
    [url, setUrl] = useState(""),
    [alt, setAlt] = useState(""),
    [linkText, setLinkText] = useState(""),
    [attachments, setAttachments] = useState<Attachment[]>([]),
    [attachmentLoading, setAttachmentLoading] = useState(false);
  const field = useRef<HTMLInputElement>(null),
    uploads = useRef(new Set<string>()),
    selection = useRef({ from: 1, to: 1 }),
    actions = useRef<{
      stage: (files: File[]) => void;
      open: (panel: Panel) => void;
    }>({ stage: () => {}, open: () => {} });
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        heading: { levels: [1, 2, 3] },
      }),
      Callout,
      ResizableImage.configure({ allowBase64: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
      }),
      Underline,
      Subscript,
      Superscript,
      Highlight,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Start writing, or type / to insert something…",
      }),
    ],
    content: toEditorHTML(page.Content || ""),
    editorProps: {
      attributes: {
        class: "rich-prose",
        role: "textbox",
        "aria-label": "Article content",
        "aria-multiline": "true",
      },
      handlePaste(_view, event) {
        const files = Array.from(event.clipboardData?.files || []).filter(
          canImage,
        );
        if (!files.length) return false;
        event.preventDefault();
        actions.current.stage(files);
        return true;
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files || []).filter(
          canImage,
        );
        if (!files.length) return false;
        event.preventDefault();
        const position = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (position)
          selection.current = { from: position.pos, to: position.pos };
        actions.current.stage(files);
        return true;
      },
      handleKeyDown(view, event) {
        if (
          event.key === "/" &&
          !event.ctrlKey &&
          !event.metaKey &&
          !view.state.selection.$from.parent.textContent
        ) {
          event.preventDefault();
          actions.current.open("insert");
          return true;
        }
        return false;
      },
    },
    onUpdate() {
      setChanged(true);
      setTick((n) => n + 1);
    },
    onSelectionUpdate({ editor }) {
      selection.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
      setTick((n) => n + 1);
    },
  });
  const descendants = new Set<number>(basePage.Id ? [basePage.Id] : []);
  for (let again = true; again;) {
    again = false;
    for (const candidate of pages) {
      if (
        candidate.ParentPageId &&
        descendants.has(candidate.ParentPageId) &&
        !descendants.has(candidate.Id)
      ) {
        descendants.add(candidate.Id);
        again = true;
      }
    }
  }
  const hasChildren = Boolean(
    basePage.Id && pages.some((p) => p.ParentPageId === basePage.Id),
  );
  const dirty =
    changed ||
    title !== (page.Title || "") ||
    summary !== (page.Summary || "") ||
    tags !== (page.Tags?.join(", ") || "") ||
    spaceId !== (page.SpaceId || spaces[0]?.Id || 0) ||
    parentId !== (page.ParentPageId ?? null) ||
    template !== (page.TemplateType || "blank") ||
    Boolean(changeNote);
  useLayoutEffect(() => {
    onStateChange({ dirty, busy });
  }, [dirty, busy, onStateChange]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  useEffect(() => {
    // Changing editability is UI state, not a document edit.
    editor?.setEditable(!busy && !sourceMode, false);
  }, [editor, busy, sourceMode]);
  useEffect(
    () => () => {
      uploads.current.forEach((value) => URL.revokeObjectURL(value));
    },
    [],
  );
  useEffect(() => {
    setQuery("");
    setMenuIndex(0);
    if (panel === "image" && basePage.Id) {
      setAttachmentLoading(true);
      service
        .getAttachments(basePage.Id)
        .then((files) =>
          setAttachments(
            files.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.FileName)),
          ),
        )
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setAttachmentLoading(false));
    }
  }, [panel, basePage.Id]);
  function open(next: Panel) {
    if (!editor || sourceMode) return;
    if (panel === next) {
      setPanel(null);
      return;
    }
    if (next === "link" && editor.isActive("link"))
      editor.commands.extendMarkRange("link");
    selection.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    setError("");
    setUrl(next === "link" ? editor.getAttributes("link").href || "" : "");
    setAlt("");
    setLinkText(
      editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        " ",
      ),
    );
    setPanel(next);
  }
  function insert(
    content: Parameters<TiptapEditor["commands"]["insertContent"]>[0],
  ) {
    if (!editor) return;
    editor.chain().focus().insertContentAt(selection.current, content).run();
    setPanel(null);
  }
  function stage(files: File[]) {
    if (!editor || busy) return;
    setError("");
    const limit = service.mode === "local" ? 2 : 10;
    const rejected = files.find(
      (f) => !canImage(f) || f.size > limit * 1024 * 1024,
    );
    if (rejected) {
      setError(`Use PNG, JPEG, GIF, or WebP images up to ${limit} MB each.`);
      return;
    }
    const images = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    images.forEach((image) => uploads.current.add(image.previewUrl));
    setPending((current) => [...current, ...images]);
    insert(
      images.map((image) => ({
        type: "image",
        attrs: {
          src: image.previewUrl,
          alt: image.file.name.replace(/\.[^.]+$/, ""),
          width: "100%",
        },
      })),
    );
  }
  actions.current = { stage, open };
  function command(run: () => unknown) {
    run();
    setPanel(null);
  }
  function addCallout(kind: string) {
    insert({
      type: "blockquote",
      attrs: { callout: kind },
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `Add your ${kind === "decision" ? "decision" : "context"} here.`,
            },
          ],
        },
      ],
    });
  }
  function chooseTemplate(key: string) {
    if (!editor) return;
    const apply = () => {
      setTemplate(key);
      editor.commands.setContent(toEditorHTML(templates[key].body));
      setSource(templates[key].body);
      setChanged(true);
    };
    if (editor.getText().trim()) {
      setConfirmation({
        title: "Replace the page content?",
        message:
          "This template will replace the current article body. Your title and page details will stay the same.",
        actionLabel: "Use template",
        action: apply,
      });
    } else apply();
  }
  function switchSource() {
    if (!editor) return;
    if (sourceMode) {
      editor.commands.setContent(toEditorHTML(source));
      setSourceMode(false);
      setChanged(true);
      setPanel(null);
    } else {
      if (
        pending.some((image) => editor.getHTML().includes(image.previewUrl))
      ) {
        setError(
          "Save the page before switching attached images to Markdown source.",
        );
        setPanel(null);
        return;
      }
      setPanel(null);
      setConfirmation({
        title: "Switch to Markdown source?",
        message:
          "Markdown keeps headings, lists, tables, links, images, and code. Some visual formatting may be simplified when you return to the editor.",
        actionLabel: "Switch to source",
        action: () => {
          setSource(toMarkdown(serializeContent(editor.getHTML())));
          setSourceMode(true);
        },
      });
    }
  }
  async function downloadRecovery() {
    if (!editor || busy) return;
    setBusy(true);
    try {
      const container = document.createElement("template");
      container.innerHTML = sourceMode
        ? toEditorHTML(source)
        : editor.getHTML();
      for (const image of container.content.querySelectorAll("img")) {
        const staged = pending.find(
          (item) => item.previewUrl === image.getAttribute("src"),
        );
        if (!staged) continue;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error("Could not read an image for the recovery copy."));
          reader.readAsDataURL(staged.file);
        });
        image.setAttribute("src", dataUrl);
      }
      const markdown = `# ${title || "Untitled page"}\n\n${summary ? summary + "\n\n" : ""}${toMarkdown(serializeContent(container.innerHTML))}`;
      const url = URL.createObjectURL(
        new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "article"}-recovery.md`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(
        (previous) =>
          `${previous} Recovery export failed: ${failure instanceof Error ? failure.message : String(failure)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(status: Page["Status"]) {
    if (!editor || busy || retryBlocked) return;
    if (!title.trim() || !spaceId) {
      setError("Enter a page title and choose a space.");
      return;
    }
    setBusy(true);
    setPanel(null);
    setError("");
    try {
      const content = sourceMode ? source : serializeContent(editor.getHTML());
      await onSave(
        {
          ...basePage,
          Title: title.trim(),
          SpaceId: spaceId,
          ParentPageId: parentId,
          Summary: summary.trim(),
          Tags: [
            ...new Set(
              tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            ),
          ],
          Content: content,
          TemplateType: template,
          Status: status,
        },
        changeNote.trim(),
        pending,
      );
    } catch (e) {
      if (e instanceof ImageSaveError) {
        setBasePage(e.page);
        setPending(e.remainingImages);
        setRetryBlocked(e.retryBlocked);
        editor.commands.setContent(toEditorHTML(e.page.Content), false);
        if (sourceMode) setSource(toMarkdown(e.page.Content));
      }
      setError(
        e instanceof Error
          ? e.message
          : "The page could not be saved. Your edits are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  const words = editor
    ? (sourceMode ? contentText(source) : editor.getText())
        .trim()
        .split(/\s+/)
        .filter(Boolean).length
    : 0;
  const inserts = [
    {
      name: "Image",
      hint: "Upload, paste, or use a link",
      icon: <ImagePlus size={19} />,
      run: () => setPanel("image"),
    },
    {
      name: "Symbols & emoji",
      hint: "Measurements, mathematics, and more",
      icon: <Smile size={19} />,
      run: () => setPanel("symbol"),
    },
    {
      name: "Code block",
      hint: "Code with a language label",
      icon: <Code2 size={19} />,
      run: () =>
        insert({
          type: "codeBlock",
          attrs: { language: "text" },
          content: [{ type: "text", text: "Your code here" }],
        }),
    },
    {
      name: "Table",
      hint: "Organize information into rows",
      icon: <Table2 size={19} />,
      run: () =>
        command(() =>
          editor
            ?.chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
        ),
    },
    {
      name: "Action list",
      hint: "Keep track of tasks",
      icon: <ListChecks size={19} />,
      run: () => command(() => editor?.chain().focus().toggleTaskList().run()),
    },
    {
      name: "Info panel",
      hint: "Helpful background and context",
      icon: <Info size={19} />,
      run: () => addCallout("info"),
    },
    {
      name: "Tip panel",
      hint: "Share a useful shortcut",
      icon: <Info size={19} />,
      run: () => addCallout("tip"),
    },
    {
      name: "Warning panel",
      hint: "Highlight a precaution",
      icon: <Info size={19} />,
      run: () => addCallout("warning"),
    },
    {
      name: "Decision panel",
      hint: "Record the agreed direction",
      icon: <Info size={19} />,
      run: () => addCallout("decision"),
    },
    {
      name: "Divider",
      hint: "Separate sections",
      icon: <Minus size={19} />,
      run: () =>
        command(() => editor?.chain().focus().setHorizontalRule().run()),
    },
  ].filter((item) =>
    `${item.name} ${item.hint}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pickerSymbols = symbols.filter(([symbol, name, category]) =>
    `${symbol} ${name} ${category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const activeHeading = editor?.isActive("heading")
    ? String(editor.getAttributes("heading").level)
    : "paragraph";
  return (
    <>
      <section
        className="rich-editor"
        aria-label={basePage.Id ? "Edit page" : "Create page"}
        aria-busy={busy}
        onKeyDownCapture={(event) => {
          // SharePoint can wrap this inline workspace in an ASP.NET form.
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            event.target.type !== "file"
          ) {
            event.preventDefault();
          }
          if (event.key === "Escape" && panel) {
            event.preventDefault();
            event.stopPropagation();
            setPanel(null);
            editor?.commands.focus();
          }
        }}
      >
        <header className="rich-page-actions">
          <div className="rich-edit-context">
            <FileEdit size={16} />
            <span>{basePage.Id ? "Editing page" : "New page"}</span>
          </div>
          <div className="rich-page-actions-right">
            <button
              type="button"
              className="button rich-close-editor"
              disabled={busy}
              onClick={onCancel}
              aria-label="Close editor"
            >
              Close
            </button>
            <div className="rich-save-actions">
              <button
                type="button"
                className="button"
                disabled={busy || retryBlocked}
                onClick={() => save("Draft")}
              >
                Save draft
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy || retryBlocked}
                onClick={() => save("Published")}
              >
                <Check size={16} />
                {busy
                  ? "Saving…"
                  : basePage.Status === "Published"
                    ? "Save changes"
                    : "Publish page"}
              </button>
            </div>
          </div>
        </header>
        <div className="rich-document-top">
          <div className="rich-location">
            <span className="rich-draft-label">
              {page.Status === "Published" ? "Editing published page" : "Draft"}
            </span>
            <span className="rich-location-divider">/</span>
            <label>
              <span className="visually-hidden">Space</span>
              <select
                aria-label="Space"
                disabled={busy || hasChildren}
                value={spaceId}
                onChange={(event) => {
                  setSpaceId(Number(event.target.value));
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
            {hasChildren && (
              <span className="rich-location-note">Contains child pages</span>
            )}
          </div>
          <div className="rich-document-tools">
            {!basePage.Id && (
              <label>
                <span className="visually-hidden">Starter template</span>
                <select
                  aria-label="Starter template"
                  disabled={busy}
                  value={template in templates ? template : "blank"}
                  onChange={(event) => chooseTemplate(event.target.value)}
                >
                  {Object.entries(templates).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              disabled={busy}
              className={`rich-details-toggle ${details ? "active" : ""}`}
              onClick={() => setDetails(!details)}
              aria-expanded={details}
              aria-controls="rich-page-details"
            >
              <Settings2 size={15} />
              Page details
            </button>
          </div>
        </div>
        <label className="rich-title-label">
          <span className="visually-hidden">Title</span>
          <input
            autoFocus
            aria-label="Title"
            disabled={busy}
            className="rich-title-input"
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give this page a title"
          />
        </label>
        {details && (
          <div className="rich-details" id="rich-page-details">
            <label>
              Summary
              <input
                disabled={busy}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Help people find this page"
              />
            </label>
            <label>
              Tags
              <input
                disabled={busy}
                maxLength={230}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="calibration, lab-ops, guides"
              />
            </label>
            <label>
              Parent page
              <select
                disabled={busy}
                value={parentId ?? ""}
                onChange={(event) =>
                  setParentId(
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">None — top-level page</option>
                {pages
                  .filter(
                    (p) =>
                      p.SpaceId === spaceId &&
                      p.Status !== "Archived" &&
                      !descendants.has(p.Id),
                  )
                  .map((p) => (
                    <option key={p.Id} value={p.Id}>
                      {p.Title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Change note
              <input
                disabled={busy}
                maxLength={255}
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                placeholder="What changed in this revision?"
              />
            </label>
          </div>
        )}
        {(error || retryBlocked) && (
          <div className="rich-error" role="alert">
            <Info size={18} />
            <span>
              {error ||
                "The save result could not be confirmed. Download a recovery copy, then reopen the page before saving again."}
              {retryBlocked && (
                <button
                  type="button"
                  className="rich-recovery-button"
                  disabled={busy}
                  onClick={() => void downloadRecovery()}
                >
                  Download a recovery copy with your images
                </button>
              )}
            </span>
            {!retryBlocked && (
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <fieldset
          className="rich-workspace"
          disabled={busy}
          aria-label="Page content and formatting"
        >
          <div
            className="rich-toolbar"
            role="toolbar"
            aria-label="Text formatting"
          >
            <div className="rich-tool-group">
              <Tool
                locked={busy || sourceMode}
                label="Undo"
                disabled={!editor?.can().undo()}
                onClick={() => {
                  editor?.chain().focus().undo().run();
                }}
              >
                <Undo2 size={17} />
              </Tool>
              <Tool
                locked={busy || sourceMode}
                label="Redo"
                disabled={!editor?.can().redo()}
                onClick={() => {
                  editor?.chain().focus().redo().run();
                }}
              >
                <Redo2 size={17} />
              </Tool>
            </div>
            <div className="rich-tool-group">
              <select
                className="rich-heading-select"
                aria-label="Text style"
                disabled={busy || sourceMode}
                value={activeHeading}
                onChange={(event) => {
                  if (event.target.value === "paragraph")
                    editor?.chain().focus().setParagraph().run();
                  else
                    editor
                      ?.chain()
                      .focus()
                      .setHeading({
                        level: Number(event.target.value) as 1 | 2 | 3,
                      })
                      .run();
                }}
              >
                <option value="paragraph">Normal text</option>
                <option value="1">Heading 1</option>
                <option value="2">Heading 2</option>
                <option value="3">Heading 3</option>
              </select>
            </div>
            <div className="rich-tool-group">
              <Tool
                locked={busy || sourceMode}
                label="Bold (Ctrl+B)"
                active={editor?.isActive("bold")}
                onClick={() => {
                  editor?.chain().focus().toggleBold().run();
                }}
              >
                <Bold size={17} />
              </Tool>
              <Tool
                locked={busy || sourceMode}
                label="Italic (Ctrl+I)"
                active={editor?.isActive("italic")}
                onClick={() => {
                  editor?.chain().focus().toggleItalic().run();
                }}
              >
                <Italic size={17} />
              </Tool>
              <Tool
                locked={busy || sourceMode}
                label="Underline (Ctrl+U)"
                active={editor?.isActive("underline")}
                onClick={() => {
                  editor?.chain().focus().toggleUnderline().run();
                }}
              >
                <UnderlineIcon size={17} />
              </Tool>
              <Tool
                locked={busy || sourceMode}
                label="More formatting"
                active={panel === "more"}
                onClick={() => open("more")}
              >
                <MoreHorizontal size={18} />
              </Tool>
            </div>
            <div className="rich-tool-group">
              <Tool
                locked={busy || sourceMode}
                label="Bullet list"
                active={editor?.isActive("bulletList")}
                onClick={() => {
                  editor?.chain().focus().toggleBulletList().run();
                }}
              >
                <List size={17} />
              </Tool>
              <Tool
                locked={busy || sourceMode}
                label="Numbered list"
                active={editor?.isActive("orderedList")}
                onClick={() => {
                  editor?.chain().focus().toggleOrderedList().run();
                }}
              >
                <ListOrdered size={17} />
              </Tool>
              <Tool
                locked={busy || sourceMode}
                label="Action list"
                active={editor?.isActive("taskList")}
                onClick={() => {
                  editor?.chain().focus().toggleTaskList().run();
                }}
              >
                <ListChecks size={17} />
              </Tool>
            </div>
            <div className="rich-tool-group">
              <Tool
                locked={busy || sourceMode}
                label="Insert link"
                active={editor?.isActive("link")}
                onClick={() => open("link")}
              >
                <Link2 size={17} />
              </Tool>
              <Tool label="Insert image" onClick={() => open("image")}>
                <ImagePlus size={18} />
              </Tool>
            </div>
            <button
              type="button"
              className={`rich-insert-button ${panel === "insert" ? "active" : ""}`}
              disabled={busy || sourceMode}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => open("insert")}
              aria-expanded={panel === "insert"}
            >
              <Plus size={16} />
              Insert
              <ChevronDown size={13} />
            </button>
            {sourceMode && (
              <button
                type="button"
                className="rich-visual-return"
                onClick={switchSource}
              >
                Return to visual editor
              </button>
            )}
          </div>
          {editor?.isActive("codeBlock") && !sourceMode && (
            <div className="rich-context-bar">
              <Code2 size={14} />
              <label>
                Code language
                <select
                  aria-label="Code language"
                  value={editor.getAttributes("codeBlock").language || "text"}
                  onChange={(event) =>
                    editor
                      .chain()
                      .focus()
                      .updateAttributes("codeBlock", {
                        language: event.target.value,
                      })
                      .run()
                  }
                >
                  {languages.map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <span>Press ↓ at the end of the block to continue writing.</span>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              >
                Convert to text
              </button>
            </div>
          )}
          {editor?.isActive("table") && !sourceMode && (
            <div className="rich-context-bar">
              <Table2 size={14} />
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
              >
                <Plus size={13} />
                Row
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
              >
                <Plus size={13} />
                Column
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteRow().run()}
              >
                Remove row
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteColumn().run()}
              >
                Remove column
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              >
                Header row
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
              >
                <Trash2 size={13} />
                Table
              </button>
            </div>
          )}
          {editor?.isActive("image") && !sourceMode && (
            <div className="rich-context-bar rich-image-settings">
              <ImagePlus size={14} />
              <label>
                Image description
                <input
                  aria-label="Image description"
                  value={editor.getAttributes("image").alt || ""}
                  onChange={(event) =>
                    editor
                      .chain()
                      .updateAttributes("image", { alt: event.target.value })
                      .run()
                  }
                />
              </label>
              <label>
                Width
                <select
                  aria-label="Image width"
                  value={String(editor.getAttributes("image").width || "100%")}
                  onChange={(event) =>
                    editor
                      .chain()
                      .updateAttributes("image", { width: event.target.value })
                      .run()
                  }
                >
                  {["25%", "50%", "75%", "100%"].map((width) => (
                    <option key={width}>{width}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteSelection().run()}
              >
                <Trash2 size={13} />
                Remove
              </button>
            </div>
          )}
          <div
            className="rich-canvas"
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files"))
                event.preventDefault();
            }}
            onDrop={(event) => {
              if (event.defaultPrevented) return;
              const files = Array.from(event.dataTransfer.files).filter(
                canImage,
              );
              if (!files.length) return;
              event.preventDefault();
              if (sourceMode) {
                setError("Return to the visual editor to add an image.");
                return;
              }
              stage(files);
            }}
          >
            {sourceMode ? (
              <textarea
                className="rich-source"
                aria-label="Article Markdown"
                value={source}
                disabled={busy}
                onChange={(event) => {
                  setSource(event.target.value);
                  setChanged(true);
                }}
              />
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
          {panel && (
            <div
              className={`rich-popover rich-popover-${panel}`}
              data-editor-popover="true"
              role="dialog"
              aria-label={
                panel === "insert"
                  ? "Insert content"
                  : panel === "symbol"
                    ? "Symbols and emoji"
                    : panel === "image"
                      ? "Insert image"
                      : panel === "link"
                        ? "Edit link"
                        : "More formatting"
              }
            >
              <div className="rich-popover-heading">
                <strong>
                  {panel === "insert"
                    ? "Insert content"
                    : panel === "symbol"
                      ? "Symbols & emoji"
                      : panel === "image"
                        ? "Add an image"
                        : panel === "link"
                          ? "Add a link"
                          : "More formatting"}
                </strong>
                <button
                  type="button"
                  aria-label="Close insert panel"
                  onClick={() => {
                    setPanel(null);
                    editor?.commands.focus();
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              {(panel === "insert" || panel === "symbol") && (
                <div className="rich-picker-search">
                  <Search size={16} />
                  <input
                    autoFocus
                    aria-label={
                      panel === "symbol"
                        ? "Search symbols"
                        : "Search insert options"
                    }
                    placeholder={
                      panel === "symbol"
                        ? "Search symbols or emoji…"
                        : "Find something to insert…"
                    }
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setMenuIndex(0);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setMenuIndex((n) =>
                          Math.min(
                            n + 1,
                            (panel === "symbol" ? pickerSymbols : inserts)
                              .length - 1,
                          ),
                        );
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setMenuIndex((n) => Math.max(0, n - 1));
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (panel === "symbol" && pickerSymbols[menuIndex])
                          insert(pickerSymbols[menuIndex][0]);
                        else inserts[menuIndex]?.run();
                      }
                    }}
                  />
                </div>
              )}
              {panel === "insert" && (
                <div className="rich-insert-list">
                  {inserts.map((item, index) => (
                    <button
                      type="button"
                      key={item.name}
                      className={menuIndex === index ? "selected" : ""}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={item.run}
                    >
                      {item.icon}
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.hint}</small>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                  {!inserts.length && <p>No matching insert options.</p>}
                </div>
              )}
              {panel === "symbol" && (
                <>
                  <div className="rich-symbol-grid">
                    {pickerSymbols.map(([symbol, name], index) => (
                      <button
                        type="button"
                        key={name}
                        className={menuIndex === index ? "selected" : ""}
                        title={name}
                        aria-label={`Insert ${name}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insert(symbol)}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                  <p className="rich-popover-note">
                    Select a symbol to insert it at your cursor.
                  </p>
                </>
              )}
              {panel === "image" && (
                <>
                  <button
                    type="button"
                    className="rich-upload-target"
                    onClick={() => field.current?.click()}
                  >
                    <Upload size={24} />
                    <strong>Upload an image</strong>
                    <span>Or paste an image directly into the page</span>
                    <small>
                      PNG, JPEG, GIF, WebP · up to{" "}
                      {service.mode === "local" ? 2 : 10} MB
                    </small>
                  </button>
                  <div className="rich-image-url">
                    <label>
                      Image URL
                      <input
                        type="url"
                        aria-label="Image URL"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://… or /sites/…"
                      />
                    </label>
                    <label>
                      Image description
                      <input
                        aria-label="New image description"
                        value={alt}
                        onChange={(event) => setAlt(event.target.value)}
                        placeholder="Describe the image for readers"
                      />
                    </label>
                    <button
                      type="button"
                      className="button"
                      disabled={!url.trim()}
                      onClick={() => {
                        const safe = safeContentUrl(url.trim(), true);
                        if (!safe || !/^(https?:|\/)/i.test(safe)) {
                          setError(
                            "Enter an HTTPS image URL or a site-relative path.",
                          );
                          return;
                        }
                        insert({
                          type: "image",
                          attrs: { src: safe, alt: alt.trim(), width: "100%" },
                        });
                      }}
                    >
                      Insert image link
                    </button>
                  </div>
                  {basePage.Id && (
                    <div className="rich-existing-images">
                      <strong>From this page’s attachments</strong>
                      {attachmentLoading ? (
                        <p>Loading images…</p>
                      ) : attachments.length ? (
                        attachments.map((file) => (
                          <button
                            type="button"
                            key={file.FileName}
                            onClick={() =>
                              insert({
                                type: "image",
                                attrs: {
                                  src: file.ServerRelativeUrl,
                                  alt: file.FileName,
                                  width: "100%",
                                },
                              })
                            }
                          >
                            <ImagePlus size={15} />
                            {file.FileName}
                          </button>
                        ))
                      ) : (
                        <p>No attached images yet.</p>
                      )}
                    </div>
                  )}
                  <p className="rich-popover-note">
                    Uploaded images are attached when you save the page.
                  </p>
                </>
              )}
              {panel === "link" && (
                <div className="rich-link-fields">
                  <label>
                    Link text
                    <input
                      autoFocus
                      aria-label="Link text"
                      value={linkText}
                      onChange={(event) => setLinkText(event.target.value)}
                    />
                  </label>
                  <label>
                    Destination
                    <input
                      aria-label="Link destination"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://… or #heading"
                    />
                  </label>
                  <div className="rich-popover-actions">
                    {editor?.isActive("link") && (
                      <button
                        type="button"
                        className="button"
                        onClick={() =>
                          command(() =>
                            editor
                              .chain()
                              .focus()
                              .extendMarkRange("link")
                              .unsetLink()
                              .run(),
                          )
                        }
                      >
                        Remove link
                      </button>
                    )}
                    <button
                      type="button"
                      className="button primary"
                      disabled={!url.trim()}
                      onClick={() => {
                        const safe = safeContentUrl(url.trim());
                        if (!safe) {
                          setError(
                            "Use an HTTPS, mailto, or relative page link.",
                          );
                          return;
                        }
                        insert({
                          type: "text",
                          text: linkText.trim() || safe,
                          marks: [
                            {
                              type: "link",
                              attrs: {
                                href: safe,
                                target: "_blank",
                                rel: "noopener noreferrer",
                              },
                            },
                          ],
                        });
                      }}
                    >
                      Insert link
                    </button>
                  </div>
                </div>
              )}
              {panel === "more" && (
                <div className="rich-more-options">
                  <button
                    type="button"
                    onClick={() =>
                      command(() =>
                        editor?.chain().focus().toggleStrike().run(),
                      )
                    }
                  >
                    <Strikethrough size={16} />
                    Strikethrough
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      command(() =>
                        editor?.chain().focus().toggleHighlight().run(),
                      )
                    }
                  >
                    <span className="rich-highlight-symbol">H</span>Highlight
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      command(() => editor?.chain().focus().toggleCode().run())
                    }
                  >
                    <Code2 size={16} />
                    Inline code
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      command(() =>
                        editor?.chain().focus().toggleSuperscript().run(),
                      )
                    }
                  >
                    <span>x²</span>Superscript
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      command(() =>
                        editor?.chain().focus().toggleSubscript().run(),
                      )
                    }
                  >
                    <span>x₂</span>Subscript
                  </button>
                  <div className="rich-alignment">
                    {[
                      ["left", <AlignLeft size={16} />],
                      ["center", <AlignCenter size={16} />],
                      ["right", <AlignRight size={16} />],
                    ].map(([alignment, icon]) => (
                      <button
                        type="button"
                        key={String(alignment)}
                        aria-label={`Align ${alignment}`}
                        onClick={() =>
                          command(() =>
                            editor
                              ?.chain()
                              .focus()
                              .setTextAlign(String(alignment))
                              .run(),
                          )
                        }
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      command(() =>
                        editor
                          ?.chain()
                          .focus()
                          .unsetAllMarks()
                          .clearNodes()
                          .run(),
                      )
                    }
                  >
                    Clear formatting
                  </button>
                  <button type="button" onClick={switchSource}>
                    <Code2 size={16} />
                    Markdown source
                  </button>
                </div>
              )}
            </div>
          )}
          <input
            className="visually-hidden"
            ref={field}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            aria-label="Upload editor images"
            onChange={(event) => {
              stage(Array.from(event.target.files || []));
              event.target.value = "";
            }}
          />
        </fieldset>
        <footer className="rich-editor-footer">
          <div>
            <span className={`rich-save-state ${dirty ? "unsaved" : ""}`}>
              <span />
              {busy
                ? "Saving page…"
                : dirty
                  ? "Unsaved changes"
                  : "No changes yet"}
            </span>
            <span className="rich-word-count">
              {words} {words === 1 ? "word" : "words"}
              {pending.length
                ? ` · ${pending.length} image${pending.length === 1 ? "" : "s"} to upload`
                : ""}
            </span>
          </div>
        </footer>
      </section>
      {confirmation && (
        <Modal title={confirmation.title} onClose={() => setConfirmation(null)}>
          <p className="discard-description">{confirmation.message}</p>
          <div className="button-row discard-actions">
            <button
              type="button"
              className="button"
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                const action = confirmation.action;
                setConfirmation(null);
                action();
              }}
            >
              {confirmation.actionLabel}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
