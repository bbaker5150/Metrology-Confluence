import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  ExternalHyperlink,
  ImageRun,
  AlignmentType,
  type ParagraphChild,
  type IRunOptions,
  type IParagraphOptions,
} from "docx";
import type { Attachment, Page } from "../types";
import { safeContentUrl, toEditorHTML } from "./content";

export type WordExportOptions = {
  attachments?: Attachment[];
  readAttachment?: (fileName: string) => Promise<File>;
  pageUrl?: string;
};
const headings = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];
export async function createWordDocument(
  page: Page,
  options: WordExportOptions = {},
) {
  const root = document.createElement("div");
  root.innerHTML = toEditorHTML(page.Content);
  const warnings = new Set<string>();
  const images = new Map<string, Promise<ParagraphChild>>();
  let imageBytes = 0;
  const absoluteLink = (href: string) => {
    const safe = safeContentUrl(href);
    if (!safe) return "";
    try {
      return new URL(safe, options.pageUrl || location.href).href;
    } catch {
      return "";
    }
  };
  async function image(node: HTMLElement): Promise<ParagraphChild> {
    const src = node.getAttribute("src") || "";
    if (images.has(src)) return images.get(src)!;
    const promise = (async () => {
      try {
        let file: Blob;
        if (
          /^data:image\/(png|jpeg|gif|webp);base64,/i.test(src) &&
          src.length < 14_000_000
        ) {
          const [header, encoded] = src.split(",");
          const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
          file = new Blob([bytes], {
            type: header.slice(5, header.indexOf(";")),
          });
        } else {
          const url = absoluteLink(src);
          const attachment = options.attachments?.find(
            (a) => absoluteLink(a.ServerRelativeUrl) === url,
          );
          if (!attachment || !options.readAttachment)
            throw new Error("Image is not a page attachment");
          file = await options.readAttachment(attachment.FileName);
        }
        imageBytes += file.size;
        if (file.size > 10 * 1024 * 1024 || imageBytes > 25 * 1024 * 1024)
          throw new Error("Image size limit");
        const bitmap = await createImageBitmap(file);
        try {
          const requested = Number(node.getAttribute("width"));
          const width = Math.max(
            1,
            Math.min(requested > 0 ? requested : bitmap.width, 570),
          );
          const height = Math.max(
            1,
            Math.round((width * bitmap.height) / bitmap.width),
          );
          const scale = Math.min(1, 720 / height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width * scale * 2));
          canvas.height = Math.max(1, Math.round(height * scale * 2));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Image conversion unavailable");
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const png = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) =>
                b ? resolve(b) : reject(new Error("Image conversion failed")),
              "image/png",
            ),
          );
          return new ImageRun({
            type: "png",
            data: new Uint8Array(await png.arrayBuffer()),
            transformation: {
              width: Math.round(width * scale),
              height: Math.round(height * scale),
            },
            altText: {
              title: node.getAttribute("alt") || "Article image",
              description: node.getAttribute("alt") || "",
              name: "Article image",
            },
          });
        } finally {
          bitmap.close();
        }
      } catch {
        const text = `[Image: ${node.getAttribute("alt") || "unavailable"}]`;
        warnings.add(
          "Some images could not be embedded. Their descriptions and available source links are included instead.",
        );
        const url = absoluteLink(src);
        return url && !url.startsWith("data:")
          ? new ExternalHyperlink({
              link: url,
              children: [new TextRun({ text, style: "Hyperlink" })],
            })
          : new TextRun({ text, italics: true });
      }
    })();
    images.set(src, promise);
    return promise;
  }
  async function inline(
    node: Node,
    style: IRunOptions = {},
  ): Promise<ParagraphChild[]> {
    if (node.nodeType === Node.TEXT_NODE)
      return [new TextRun({ ...style, text: node.textContent || "" })];
    if (!(node instanceof HTMLElement)) return [];
    const tag = node.tagName;
    if (tag === "IMG") return [await image(node)];
    if (tag === "BR") return [new TextRun({ break: 1 })];
    if (["INPUT", "LABEL"].includes(tag)) return [];
    const next = { ...style };
    if (["B", "STRONG"].includes(tag)) next.bold = true;
    if (["I", "EM"].includes(tag)) next.italics = true;
    if (tag === "U") next.underline = {};
    if (["S", "DEL"].includes(tag)) next.strike = true;
    if (tag === "SUB") next.subScript = true;
    if (tag === "SUP") next.superScript = true;
    if (tag === "MARK") next.highlight = "yellow";
    if (tag === "CODE") {
      next.font = "Consolas";
      next.size = 20;
    }
    if (node.dataset.type === "status") {
      next.bold = true;
      next.color = "207DE9";
    }
    const children: ParagraphChild[] = [];
    for (const child of node.childNodes)
      children.push(...(await inline(child, next)));
    const href =
      tag === "A" ? absoluteLink(node.getAttribute("href") || "") : "";
    return href ? [new ExternalHyperlink({ link: href, children })] : children;
  }
  async function childrenInline(node: Node, style: IRunOptions = {}) {
    const children: ParagraphChild[] = [];
    for (const child of node.childNodes)
      children.push(...(await inline(child, style)));
    return children;
  }
  async function blocks(
    parent: Node,
    depth = 0,
  ): Promise<(Paragraph | Table)[]> {
    const result: (Paragraph | Table)[] = [];
    for (const node of parent.childNodes) {
      if (!(node instanceof HTMLElement)) {
        if (node.textContent?.trim())
          result.push(new Paragraph({ children: await inline(node) }));
        continue;
      }
      const tag = node.tagName;
      if (tag === "TABLE") {
        const rows: TableRow[] = [];
        for (const row of [...node.querySelectorAll("tr")].filter(
          (r) => r.closest("table") === node,
        )) {
          const cells: TableCell[] = [];
          for (const cell of row.children) {
            if (!/^(TH|TD)$/.test(cell.tagName)) continue;
            const content = await blocks(cell, depth);
            cells.push(
              new TableCell({
                children: content.length ? content : [new Paragraph("")],
                columnSpan: Math.max(
                  1,
                  Math.min(20, Number(cell.getAttribute("colspan")) || 1),
                ),
                rowSpan: Math.max(
                  1,
                  Math.min(100, Number(cell.getAttribute("rowspan")) || 1),
                ),
                shading: cell.tagName === "TH" ? { fill: "E8F0FA" } : undefined,
                margins: { top: 90, bottom: 90, left: 100, right: 100 },
              }),
            );
          }
          if (cells.length)
            rows.push(
              new TableRow({
                children: cells,
                tableHeader: [...row.children].every((c) => c.tagName === "TH"),
              }),
            );
        }
        if (rows.length)
          result.push(
            new Table({
              rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
            new Paragraph(""),
          );
      } else if (tag === "UL" || tag === "OL") {
        let index = Number(node.getAttribute("start")) || 1;
        for (const item of [...node.children].filter(
          (n) => n.tagName === "LI",
        )) {
          const task =
            item.getAttribute("data-type") === "taskItem" ||
            !!item.querySelector('input[type="checkbox"]');
          const checked =
            item.getAttribute("data-checked") === "true" ||
            !!item.querySelector("input[checked]");
          const body = document.createElement("div");
          for (const child of item.childNodes)
            if (!(
              child instanceof HTMLElement &&
              ["UL", "OL", "LABEL"].includes(child.tagName)
            ))
              body.append(child.cloneNode(true));
          const lines = await childrenInline(body);
          result.push(
            new Paragraph({
              children: [
                new TextRun(
                  task
                    ? checked
                      ? "☑ "
                      : "☐ "
                    : tag === "OL"
                      ? `${index++}. `
                      : "• ",
                ),
                ...lines,
              ],
              indent: { left: 360 * (depth + 1), hanging: 240 },
            }),
          );
          for (const nested of item.children)
            if (["UL", "OL"].includes(nested.tagName)) {
              const holder = document.createElement("div");
              holder.append(nested.cloneNode(true));
              result.push(...(await blocks(holder, depth + 1)));
            }
        }
      } else if (tag === "PRE") {
        for (const line of (node.textContent || "").split("\n"))
          result.push(
            new Paragraph({
              children: [
                new TextRun({ text: line || " ", font: "Consolas", size: 19 }),
              ],
              spacing: { after: 0 },
              shading: { fill: "F0F3F6" },
            }),
          );
        result.push(new Paragraph(""));
      } else if (tag === "BLOCKQUOTE" || node.hasAttribute("data-callout")) {
        const kind = node.getAttribute("data-callout");
        if (kind)
          result.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: kind.toUpperCase(),
                  bold: true,
                  color: "207DE9",
                }),
              ],
              spacing: { after: 60 },
            }),
          );
        result.push(...(await blocks(node, depth)));
      } else if (["DIV", "DETAILS", "SECTION"].includes(tag))
        result.push(...(await blocks(node, depth)));
      else if (tag === "HR")
        result.push(
          new Paragraph({
            text: "",
            border: { bottom: { color: "CED7E2", size: 6, style: "single" } },
          }),
        );
      else {
        const opts: IParagraphOptions = {
          heading: /^H[1-6]$/.test(tag)
            ? headings[Number(tag[1]) - 1]
            : undefined,
        };
        const alignment = {
          left: AlignmentType.LEFT,
          center: AlignmentType.CENTER,
          right: AlignmentType.RIGHT,
          justify: AlignmentType.JUSTIFIED,
        }[node.style.textAlign];
        result.push(
          new Paragraph({
            ...opts,
            alignment,
            children: await inline(
              node,
              tag === "SUMMARY" ? { bold: true } : {},
            ),
          }),
        );
      }
    }
    return result;
  }
  const content = await blocks(root);
  const metadata = `${page.AuthorName} · ${page.Status} · Version ${page.VersionCount}`;
  const doc = new Document({
    title: page.Title,
    creator: page.AuthorName,
    description: page.Summary,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
          paragraph: { spacing: { after: 160, line: 276 } },
        },
        heading1: { run: { size: 32, bold: true, color: "17395C" } },
        heading2: { run: { size: 28, bold: true, color: "17395C" } },
        heading3: { run: { size: 24, bold: true } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children: [
          new Paragraph({ text: page.Title, heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [
              new TextRun({ text: metadata, color: "5C6F82", size: 19 }),
            ],
          }),
          ...content,
          ...[...warnings].map(
            (text) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text,
                    italics: true,
                    color: "5C6F82",
                    size: 19,
                  }),
                ],
              }),
          ),
        ],
      },
    ],
  });
  return { blob: await Packer.toBlob(doc), warnings: [...warnings] };
}
export async function downloadWord(page: Page, options: WordExportOptions) {
  const result = await createWordDocument(page, options);
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${page.Title.replace(/[^a-z0-9_-]/gi, "-").slice(0, 100) || "article"}.docx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result.warnings;
}
