import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import hljs from "highlight.js/lib/common";
import {
  isRichContent,
  RICH_PREFIX,
  sanitizeContentHTML,
} from "../lib/content";

function plain(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? plain(child.props.children)
          : "",
    )
    .join("");
}
function slug(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-") || "section"
  );
}
function slugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const key = slug(text);
    const n = seen.get(key) || 0;
    seen.set(key, n + 1);
    return n ? `${key}-${n}` : key;
  };
}
export type Heading = { id: string; text: string; level: number };
export function extractHeadings(content: string): Heading[] {
  const id = slugger();
  if (isRichContent(content)) {
    const template = document.createElement("template");
    template.innerHTML = sanitizeContentHTML(
      content.trimStart().slice(RICH_PREFIX.length),
    );
    return Array.from(template.content.querySelectorAll("h1,h2,h3")).map(
      (heading) => ({
        id: id(heading.textContent || ""),
        text: heading.textContent || "",
        level: Number(heading.tagName[1]),
      }),
    );
  }
  let fence = "";
  const headings: Heading[] = [];
  for (const line of content.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = "";
      continue;
    }
    if (fence) continue;
    const match = line.match(/^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (match) {
      const text = match[2]
        .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_`~]/g, "");
      headings.push({ id: id(text), text, level: match[1].length });
    }
  }
  return headings;
}
function safeUrl(url: string, key: string) {
  if (
    key === "src" &&
    /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(url)
  )
    return url;
  if (key === "src" && /^(?:javascript|data|vbscript):/i.test(url.trim()))
    return "";
  return defaultUrlTransform(url);
}
function stripMarker(node: ReactNode): ReactNode {
  let removed = false;
  const walk = (children: ReactNode): ReactNode =>
    Children.map(children, (child) => {
      if (removed) return child;
      if (typeof child === "string") {
        const next = child.replace(/\[!(INFO|TIP|WARNING|DECISION)\]\s*/i, "");
        if (next !== child) removed = true;
        return next;
      }
      return isValidElement<{ children?: ReactNode }>(child)
        ? cloneElement(child, {}, walk(child.props.children))
        : child;
    });
  return walk(node);
}
function CodeBlock({
  children,
  language,
  rawCode,
}: {
  children?: ReactNode;
  language?: string;
  rawCode?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const code = rawCode ?? plain(children);
  return (
    <div className="code-block">
      <span className="code-language">{language || "Code"}</span>
      <button
        className="code-copy"
        type="button"
        aria-label="Copy code"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
        {copied ? "Copied" : failed ? "Select code to copy" : "Copy"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}
function LegacyMarkdown({
  content,
  idPrefix = "",
}: {
  content: string;
  idPrefix?: string;
}) {
  const nextId = slugger();
  const heading =
    (level: number) =>
    ({ children }: { children?: ReactNode }) =>
      createElement(
        `h${level}`,
        { id: idPrefix + nextId(plain(children)), tabIndex: -1 },
        children,
      );
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={safeUrl}
        components={{
          h1: heading(1),
          h2: heading(2),
          h3: heading(3),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("#") ? undefined : "_blank"}
              rel="noopener noreferrer"
              onClick={(event) => {
                if (
                  !href?.startsWith("#") ||
                  new URLSearchParams(href.slice(1)).has("page")
                )
                  return;
                // The hash belongs to the article router. Heading links scroll
                // inside this Markdown instance without replacing that route.
                event.preventDefault();
                let fragment = href.slice(1);
                try {
                  fragment = decodeURIComponent(fragment);
                } catch {
                  return;
                }
                const target = Array.from(
                  event.currentTarget
                    .closest(".markdown")
                    ?.querySelectorAll<HTMLElement>("[id]") || [],
                ).find((element) => element.id === idPrefix + fragment);
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
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            src ? (
              <img src={src} alt={alt || "Article image"} loading="lazy" />
            ) : (
              <span className="muted">[Image URL is not supported]</span>
            ),
          table: ({ children }) => (
            <div className="table-scroll">
              <table>{children}</table>
            </div>
          ),
          blockquote: ({ children }) => {
            const match = plain(children)
              .trim()
              .match(/^\[!(INFO|TIP|WARNING|DECISION)\]/i);
            return match ? (
              <aside className={`callout callout-${match[1].toLowerCase()}`}>
                <strong className="callout-label">
                  {match[1].toLowerCase()}
                </strong>
                {stripMarker(children)}
              </aside>
            ) : (
              <blockquote>{children}</blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function RichMarkdown({
  content,
  idPrefix = "",
}: {
  content: string;
  idPrefix?: string;
}) {
  const html = useMemo(
    () =>
      sanitizeContentHTML(
        content.trimStart().slice(RICH_PREFIX.length),
        idPrefix === "editor-",
      ),
    [content, idPrefix],
  );
  const template = document.createElement("template");
  template.innerHTML = html;
  const nextId = slugger();
  function render(node: Node, index: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof HTMLElement)) return null;
    const tag = node.tagName.toLowerCase();
    const children = () => Array.from(node.childNodes).map(render);
    const props: Record<string, unknown> = { key: index };
    if (/^h[1-3]$/.test(tag)) {
      props.id = idPrefix + nextId(node.textContent || "");
      props.tabIndex = -1;
    }
    if (node.style.textAlign) props.style = { textAlign: node.style.textAlign };
    if (tag === "pre") {
      const codeNode = node.querySelector("code");
      const language =
        codeNode?.className.match(/language-([\w-]+)/)?.[1] ||
        node.dataset.language ||
        "text";
      const code = codeNode?.textContent ?? node.textContent ?? "";
      const highlighted = hljs.getLanguage(language)
        ? hljs.highlight(code, { language, ignoreIllegals: true }).value
        : null;
      return (
        <CodeBlock key={index} language={language} rawCode={code}>
          <code
            className={`language-${language}`}
            {...(highlighted
              ? { dangerouslySetInnerHTML: { __html: highlighted } }
              : { children: code })}
          />
        </CodeBlock>
      );
    }
    if (tag === "img")
      return node.getAttribute("src") ? (
        <img
          key={index}
          src={node.getAttribute("src")!}
          alt={node.getAttribute("alt") || "Article image"}
          title={node.getAttribute("title") || undefined}
          width={node.getAttribute("width") || undefined}
          style={
            node.getAttribute("width")
              ? {
                  width: node.getAttribute("width")!.endsWith("%")
                    ? node.getAttribute("width")!
                    : Number(node.getAttribute("width")),
                }
              : undefined
          }
          data-align={node.dataset.align}
          loading="lazy"
        />
      ) : (
        <span className="muted" key={index}>
          [Image is unavailable]
        </span>
      );
    if (tag === "input")
      return (
        <input
          key={index}
          type="checkbox"
          checked={
            node.closest("[data-checked]")?.getAttribute("data-checked") ===
              "true" || node.hasAttribute("checked")
          }
          disabled
          readOnly
        />
      );
    if (tag === "a") {
      const href = node.getAttribute("href") || undefined;
      return (
        <a
          key={index}
          href={href}
          target={href?.startsWith("#") ? undefined : "_blank"}
          rel="noopener noreferrer"
          onClick={(event) => {
            if (
              !href?.startsWith("#") ||
              new URLSearchParams(href.slice(1)).has("page")
            )
              return;
            event.preventDefault();
            let fragment = href.slice(1);
            try {
              fragment = decodeURIComponent(fragment);
            } catch {
              return;
            }
            const target = Array.from(
              event.currentTarget
                .closest(".markdown")
                ?.querySelectorAll<HTMLElement>("[id]") || [],
            ).find((element) => element.id === idPrefix + fragment);
            target?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "instant"
                : "smooth",
              block: "start",
            });
            target?.focus({ preventScroll: true });
          }}
        >
          {children()}
        </a>
      );
    }
    if (["blockquote", "div"].includes(tag) && node.dataset.callout)
      return (
        <aside
          key={index}
          className={`callout callout-${node.dataset.callout}`}
        >
          <strong className="callout-label">{node.dataset.callout}</strong>
          {children()}
        </aside>
      );
    if (tag === "ul" && node.dataset.type === "taskList")
      props.className = "rich-task-list";
    if (tag === "li" && node.dataset.type === "taskItem") {
      props.className = "rich-task-item";
      props["data-checked"] = node.dataset.checked;
    }
    for (const key of ["colspan", "rowspan"])
      if (node.hasAttribute(key))
        props[key === "colspan" ? "colSpan" : "rowSpan"] = Number(
          node.getAttribute(key),
        );
    if (tag === "ol" && node.hasAttribute("start"))
      props.start = Number(node.getAttribute("start"));
    if (tag === "br" || tag === "hr") return createElement(tag, props);
    if (tag === "table") {
      const row = node.querySelector("tr");
      const widths = Array.from(row?.children || []).flatMap((cell) => {
        if (!["TD", "TH"].includes(cell.tagName)) return [];
        const span = Number(cell.getAttribute("colspan") || 1);
        return cell.hasAttribute("colwidth")
          ? cell.getAttribute("colwidth")!.split(",").map(Number)
          : Array<number>(span).fill(0);
      });
      const sized = widths.some((width) => width > 0);
      const fixed = sized && widths.every((width) => width > 0);
      const minimumWidth = widths.reduce(
        (sum, width) => sum + (width || 100),
        0,
      );
      return (
        <div className="table-scroll" key={index}>
          <table
            className={sized ? "rich-sized-table" : undefined}
            style={
              sized
                ? {
                    tableLayout: "fixed",
                    width: fixed ? `${minimumWidth}px` : "100%",
                    minWidth: `${minimumWidth}px`,
                  }
                : undefined
            }
          >
            {sized && (
              <colgroup>
                {widths.map((width, column) => (
                  <col
                    key={column}
                    style={width ? { width: `${width}px` } : undefined}
                  />
                ))}
              </colgroup>
            )}
            {children()}
          </table>
        </div>
      );
    }
    return createElement(tag, props, children());
  }
  return (
    <div className="markdown rich-document">
      {Array.from(template.content.childNodes).map(render)}
    </div>
  );
}
export default function Markdown(props: {
  content: string;
  idPrefix?: string;
}) {
  return isRichContent(props.content) ? (
    <RichMarkdown {...props} />
  ) : (
    <LegacyMarkdown {...props} />
  );
}
