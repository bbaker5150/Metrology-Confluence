import DOMPurify from "dompurify";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

/** Existing Markdown remains valid; only visual-editor saves use this envelope. */
export const RICH_PREFIX = "<!-- metrology-rich-text:v1 -->";
export const isRichContent = (content: string) =>
  content.trimStart().startsWith(RICH_PREFIX);
const CALLOUTS = new Set(["info", "tip", "warning", "decision"]);
export const STATUS_TONES = [
  "neutral",
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
] as const;
export type StatusTone = (typeof STATUS_TONES)[number];
export function normalizeStatusTone(value: unknown): StatusTone {
  return STATUS_TONES.includes(value as StatusTone)
    ? (value as StatusTone)
    : "neutral";
}
export function normalizeStatusLabel(value: unknown): string {
  return (
    Array.from(
      String(value ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
      .slice(0, 40)
      .join("") || "Status"
  );
}
const tags = [
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "sub",
  "sup",
  "mark",
  "span",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "div",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "img",
  "input",
  "label",
  "details",
  "summary",
];
const attributes = [
  "href",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "colspan",
  "colwidth",
  "rowspan",
  "start",
  "class",
  "style",
  "type",
  "checked",
  "disabled",
  "data-type",
  "data-checked",
  "data-callout",
  "data-language",
  "data-width",
  "data-align",
  "data-tone",
];
function documentFragment(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template;
}
export function safeContentUrl(url: string, image = false, allowBlob = false) {
  const value = url.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return "";
  if (
    image &&
    /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
  )
    return value;
  if (image && allowBlob && value.startsWith("blob:")) {
    try {
      return new URL(value).origin ===
        new URL(document.baseURI || location.href).origin
        ? value
        : "";
    } catch {
      return "";
    }
  }
  if (/^(?:data|blob|javascript|vbscript):/i.test(value)) return "";
  try {
    const parsed = new URL(value, document.baseURI || location.href);
    if (
      ["http:", "https:"].includes(parsed.protocol) ||
      (!image && ["mailto:", "tel:"].includes(parsed.protocol))
    )
      return value;
  } catch {
    /* Invalid URLs are not rendered. */
  }
  return "";
}
/** Sanitize both legacy imports and rich saves. Styles are restricted to text/image layout. */
export function sanitizeContentHTML(
  html: string,
  allowBlobImages = false,
): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: attributes,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // Blob images only occur during an unsaved editing session, and are checked below.
    ADD_URI_SAFE_ATTR: ["src"],
  });
  const template = documentFragment(sanitized);
  for (const element of template.content.querySelectorAll<HTMLElement>("*")) {
    const alignment = element.style.textAlign;
    element.removeAttribute("style");
    if (
      ["left", "center", "right", "justify"].includes(alignment) &&
      /^(P|H[1-6]|TH|TD|DIV)$/.test(element.tagName)
    )
      element.style.textAlign = alignment;
    const classes = (element.getAttribute("class") || "")
      .split(/\s+/)
      .filter((c) => /^language-[a-z0-9_-]{1,30}$/i.test(c));
    if (classes.length && element.tagName === "CODE")
      element.className = classes.join(" ");
    else element.removeAttribute("class");
    const callout = element.getAttribute("data-callout");
    if (
      callout &&
      (!CALLOUTS.has(callout) ||
        !["DIV", "BLOCKQUOTE"].includes(element.tagName))
    )
      element.removeAttribute("data-callout");
    const dataType = element.getAttribute("data-type");
    if (
      dataType &&
      !(
        (dataType === "taskList" && element.tagName === "UL") ||
        (dataType === "taskItem" && element.tagName === "LI") ||
        (dataType === "expand" && element.tagName === "DETAILS") ||
        (dataType === "expandContent" &&
          element.tagName === "DIV" &&
          element.parentElement?.tagName === "DETAILS") ||
        (dataType === "status" && element.tagName === "SPAN")
      )
    )
      element.removeAttribute("data-type");
    if (element.tagName === "SPAN" && dataType === "status") {
      element.setAttribute(
        "data-tone",
        normalizeStatusTone(element.getAttribute("data-tone")),
      );
      element.textContent = normalizeStatusLabel(element.textContent);
    } else element.removeAttribute("data-tone");
    if (element.hasAttribute("data-checked")) {
      if (
        element.tagName === "LI" &&
        element.getAttribute("data-type") === "taskItem"
      )
        element.setAttribute(
          "data-checked",
          String(element.getAttribute("data-checked") === "true"),
        );
      else element.removeAttribute("data-checked");
    }
    // ProseMirror stores resized column widths on cells, then reconstructs its
    // colgroup on import. Preserve only bounded integer arrays, never CSS.
    for (const span of ["colspan", "rowspan"]) {
      const value = element.getAttribute(span);
      if (
        value &&
        (!["TD", "TH"].includes(element.tagName) ||
          !/^[1-9]\d{0,2}$/.test(value) ||
          Number(value) > 100)
      )
        element.removeAttribute(span);
    }
    const columnWidth = element.getAttribute("colwidth");
    if (columnWidth !== null) {
      const widths = columnWidth.split(",");
      const span = Number(element.getAttribute("colspan") || 1);
      if (
        !["TD", "TH"].includes(element.tagName) ||
        widths.length !== span ||
        widths.some((width) => !/^(?:0|[1-9]\d{0,3})$/.test(width))
      )
        element.removeAttribute("colwidth");
    }
    for (const key of ["width", "height", "data-width"]) {
      const value = element.getAttribute(key);
      if (
        value &&
        (element.tagName !== "IMG" ||
          !/^(?:[1-9]\d{0,3}|(?:25|50|75|100)%)$/.test(value))
      )
        element.removeAttribute(key);
    }
    if (element.tagName === "IMG") {
      const src = safeContentUrl(
        element.getAttribute("src") || "",
        true,
        allowBlobImages,
      );
      if (src) element.setAttribute("src", src);
      else element.removeAttribute("src");
      const width =
        element.getAttribute("data-width") || element.getAttribute("width");
      if (width) element.setAttribute("width", width);
      const align = element.getAttribute("data-align");
      if (align && !["left", "center", "right"].includes(align))
        element.removeAttribute("data-align");
    } else {
      element.removeAttribute("src");
      element.removeAttribute("data-width");
      element.removeAttribute("data-align");
    }
    if (element.tagName === "A") {
      const href = safeContentUrl(element.getAttribute("href") || "");
      if (href) element.setAttribute("href", href);
      else element.removeAttribute("href");
    } else element.removeAttribute("href");
    if (element.tagName === "INPUT") {
      if (element.getAttribute("type") !== "checkbox") {
        element.remove();
        continue;
      }
      element.setAttribute("disabled", "");
      const task = element.closest<HTMLElement>('li[data-type="taskItem"]');
      if (task)
        element.toggleAttribute("checked", task.dataset.checked === "true");
    }
    if (
      element.hasAttribute("data-language") &&
      (element.tagName !== "PRE" ||
        !/^[a-z0-9_-]{1,30}$/i.test(
          element.getAttribute("data-language") || "",
        ))
    )
      element.removeAttribute("data-language");
  }
  // A section has one plain-text title and one rich body. Normalize pasted
  // native details as well as our saved structure without dropping body nodes.
  for (const details of Array.from(
    template.content.querySelectorAll("details"),
  ).reverse()) {
    const title = Array.from(details.children).find(
      (child) => child.tagName === "SUMMARY",
    );
    const summary = document.createElement("summary");
    summary.textContent =
      title?.textContent?.replace(/\s+/g, " ").trim() || "More details";
    title?.remove();
    const body = document.createElement("div");
    body.dataset.type = "expandContent";
    for (const child of Array.from(details.childNodes)) {
      if (
        child instanceof HTMLElement &&
        child.dataset.type === "expandContent"
      )
        body.append(...Array.from(child.childNodes));
      else if (child instanceof HTMLElement && child.tagName === "SUMMARY") {
        const paragraph = document.createElement("p");
        paragraph.textContent = child.textContent;
        body.append(paragraph);
      } else body.append(child);
    }
    if (!body.childNodes.length) body.append(document.createElement("p"));
    details.removeAttribute("open");
    details.dataset.type = "expand";
    details.replaceChildren(summary, body);
  }
  for (const summary of template.content.querySelectorAll("summary")) {
    if (summary.parentElement?.tagName !== "DETAILS") {
      const paragraph = document.createElement("p");
      paragraph.textContent = summary.textContent;
      summary.replaceWith(paragraph);
    }
  }
  return template.innerHTML;
}
function convertLegacyStructures(html: string) {
  const template = documentFragment(html);
  for (const quote of template.content.querySelectorAll("blockquote")) {
    const first = quote.querySelector("p");
    const match = first?.textContent?.match(
      /^\[!(INFO|TIP|WARNING|DECISION)\]\s*/i,
    );
    if (first && match) {
      quote.setAttribute("data-callout", match[1].toLowerCase());
      const walker = document.createTreeWalker(first, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (text)
        text.textContent = (text.textContent || "").replace(
          /^\[!(INFO|TIP|WARNING|DECISION)\]\s*/i,
          "",
        );
      if (!first.textContent?.trim() && !first.querySelector("img"))
        first.remove();
    }
  }
  for (const li of template.content.querySelectorAll("li")) {
    const checkbox = li.querySelector<HTMLInputElement>(
      ":scope > input[type=checkbox],:scope > p > input[type=checkbox]",
    );
    if (!checkbox) continue;
    li.setAttribute("data-type", "taskItem");
    li.setAttribute("data-checked", String(checkbox.checked));
    li.parentElement?.setAttribute("data-type", "taskList");
    checkbox.remove();
    const div = document.createElement("div");
    while (li.firstChild) div.append(li.firstChild);
    if (!div.querySelector("p")) {
      const paragraph = document.createElement("p");
      while (div.firstChild) paragraph.append(div.firstChild);
      div.append(paragraph);
    }
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = li.dataset.checked === "true";
    input.disabled = true;
    label.append(input);
    li.append(label, div);
  }
  return template.innerHTML;
}
export function toEditorHTML(content: string): string {
  if (isRichContent(content))
    return sanitizeContentHTML(
      content.trimStart().slice(RICH_PREFIX.length),
      true,
    );
  const html = marked.parse(content, { gfm: true, async: false }) as string;
  return sanitizeContentHTML(convertLegacyStructures(html), true);
}
export function serializeContent(html: string): string {
  return RICH_PREFIX + "\n" + sanitizeContentHTML(html, true);
}
export function toMarkdown(content: string): string {
  if (!isRichContent(content)) return content;
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  service.use(gfm);
  service.addRule("callout", {
    filter: (node) =>
      ["BLOCKQUOTE", "DIV"].includes(node.nodeName) &&
      CALLOUTS.has(node.getAttribute("data-callout") || ""),
    replacement: (body, node) =>
      `\n\n> [!${(node as HTMLElement).getAttribute("data-callout")!.toUpperCase()}]\n${body
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`,
  });
  service.addRule("taskItem", {
    filter: (node) =>
      node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem",
    replacement: (body, node) =>
      `- [${(node as HTMLElement).getAttribute("data-checked") === "true" ? "x" : " "}] ${body.replace(/^\s*\[[ x]\]\s*/, "").trim()}\n`,
  });
  service.addRule("checkbox", { filter: "input", replacement: () => "" });
  // Markdown exports deliberately expand every section so no hidden text is
  // omitted when the file is read outside this application.
  service.addRule("expandTitle", {
    filter: "summary",
    replacement: (body) => `\n\n**${body.trim()}**\n\n`,
  });
  service.addRule("expandSection", {
    filter: "details",
    replacement: (body) => `\n\n${body.trim()}\n\n`,
  });
  service.addRule("inlineStatus", {
    filter: (node) =>
      node.nodeName === "SPAN" && node.getAttribute("data-type") === "status",
    replacement: (body) => body,
  });
  service.addRule("extendedFormatting", {
    filter: ["u", "sub", "sup", "mark"],
    replacement: (body, node) =>
      `<${node.nodeName.toLowerCase()}>${body}</${node.nodeName.toLowerCase()}>`,
  });
  return service.turndown(
    sanitizeContentHTML(content.trimStart().slice(RICH_PREFIX.length)),
  );
}
export function contentText(content: string): string {
  const template = documentFragment(toEditorHTML(content));
  for (const node of template.content.querySelectorAll(
    "p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote,br,summary,details",
  ))
    node.append(document.createTextNode(" "));
  for (const image of template.content.querySelectorAll("img"))
    image.replaceWith(document.createTextNode(image.alt || ""));
  return (template.content.textContent || "").replace(/\s+/g, " ").trim();
}
