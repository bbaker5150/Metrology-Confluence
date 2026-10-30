import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";

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
function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const code = plain(children);
  return (
    <div className="code-block">
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
export default function Markdown({
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
