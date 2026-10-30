import { Node as TiptapNode, type JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { normalizeStatusLabel, normalizeStatusTone } from "../lib/content";
import "./documentBlocks.css";

export { STATUS_TONES } from "../lib/content";

/** Native details are portable; open/closed state belongs to the reader. */
export const ExpandableSection = TiptapNode.create({
  name: "expand",
  group: "block",
  content: "expandSummary expandContent",
  defining: true,
  isolating: true,
  parseHTML: () => [{ tag: "details" }],
  renderHTML: () => ["details", { "data-type": "expand" }, 0],
  addNodeView() {
    return () => {
      const dom = document.createElement("details");
      dom.dataset.type = "expand";
      dom.open = true;
      const syncToggle = () => {
        const button = dom.querySelector<HTMLButtonElement>(
          ":scope > summary > button",
        );
        button?.setAttribute("aria-expanded", String(dom.open));
        button?.setAttribute(
          "aria-label",
          dom.open ? "Collapse section" : "Expand section",
        );
      };
      dom.addEventListener("toggle", syncToggle);
      return {
        dom,
        contentDOM: dom,
        ignoreMutation: (mutation) =>
          mutation.type === "attributes" &&
          mutation.target === dom &&
          mutation.attributeName === "open",
        destroy: () => dom.removeEventListener("toggle", syncToggle),
      };
    };
  },
});

export const ExpandSummary = TiptapNode.create({
  name: "expandSummary",
  content: "text*",
  marks: "",
  defining: true,
  parseHTML: () => [{ tag: "summary" }],
  renderHTML: () => ["summary", 0],
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state, view } = this.editor;
        const { $from } = state.selection;
        if ($from.parent.type.name !== this.name) return false;
        // Enter begins the rich body instead of duplicating the required title.
        const summaryDOM = view.nodeDOM($from.before());
        if (summaryDOM?.parentElement instanceof HTMLDetailsElement)
          summaryDOM.parentElement.open = true;
        const bodyStart = $from.after() + 1;
        const tr = state.tr.setSelection(
          TextSelection.near(state.doc.resolve(bodyStart), 1),
        );
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
  addNodeView() {
    return ({ editor, getPos }) => {
      const dom = document.createElement("summary");
      dom.tabIndex = -1;
      const button = document.createElement("button");
      button.type = "button";
      button.contentEditable = "false";
      button.className = "expand-editor-toggle";
      button.setAttribute("aria-label", "Collapse section");
      button.setAttribute("aria-expanded", "true");
      const contentDOM = document.createElement("span");
      contentDOM.className = "expand-editor-title";
      dom.append(button, contentDOM);
      const onClick = (event: MouseEvent) => {
        // Editing the title must never trigger the native summary toggle.
        event.preventDefault();
        if (!button.contains(event.target as globalThis.Node)) return;
        const details = dom.parentElement;
        if (details instanceof HTMLDetailsElement) {
          details.open = !details.open;
          if (!details.open) {
            const position = getPos();
            if (typeof position === "number") {
              const summary = editor.state.doc.nodeAt(position);
              if (summary)
                editor.commands.setTextSelection(
                  position + summary.nodeSize - 1,
                );
            }
          }
          button.setAttribute("aria-expanded", String(details.open));
          button.setAttribute(
            "aria-label",
            details.open ? "Collapse section" : "Expand section",
          );
        }
      };
      const onMouseDown = (event: MouseEvent) => event.preventDefault();
      dom.addEventListener("click", onClick);
      button.addEventListener("mousedown", onMouseDown);
      return {
        dom,
        contentDOM,
        stopEvent: (event) => button.contains(event.target as globalThis.Node),
        ignoreMutation: (mutation) =>
          mutation.type !== "selection" && button.contains(mutation.target),
        destroy() {
          dom.removeEventListener("click", onClick);
          button.removeEventListener("mousedown", onMouseDown);
        },
      };
    };
  },
});

export const ExpandContent = TiptapNode.create({
  name: "expandContent",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: 'div[data-type="expandContent"]' }],
  renderHTML: () => ["div", { "data-type": "expandContent" }, 0],
});

export const InlineStatus = TiptapNode.create({
  name: "status",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state;
        if (
          !(selection instanceof NodeSelection) ||
          selection.node.type.name !== this.name
        )
          return false;
        // Keep a selected chip when continuing the document. Splitting with a
        // NodeSelection would leave it selected for the next insert to replace.
        return this.editor
          .chain()
          .setTextSelection(selection.to)
          .splitBlock()
          .run();
      },
    };
  },
  addAttributes() {
    return {
      label: {
        default: "In progress",
        parseHTML: (element) => normalizeStatusLabel(element.textContent),
        rendered: false,
      },
      tone: {
        default: "blue",
        parseHTML: (element) =>
          normalizeStatusTone(element.getAttribute("data-tone")),
        rendered: false,
      },
    };
  },
  parseHTML: () => [{ tag: 'span[data-type="status"]' }],
  renderHTML({ node }) {
    return [
      "span",
      {
        "data-type": "status",
        "data-tone": normalizeStatusTone(node.attrs.tone),
      },
      normalizeStatusLabel(node.attrs.label),
    ];
  },
  renderText: ({ node }) => normalizeStatusLabel(node.attrs.label),
});

export function createExpandSection(title = "More details"): JSONContent {
  return {
    type: "expand",
    content: [
      {
        type: "expandSummary",
        content: [{ type: "text", text: title.trim() || "More details" }],
      },
      { type: "expandContent", content: [{ type: "paragraph" }] },
    ],
  };
}
