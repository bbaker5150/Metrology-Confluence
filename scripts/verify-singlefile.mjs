import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parse } from "parse5";

const target = resolve(process.argv[2] || "dist/index.html");
const entries = await readdir(dirname(target), { withFileTypes: true });
if (
  entries.length !== 1 ||
  entries[0].name !== "index.html" ||
  !entries[0].isFile()
) {
  throw new Error(
    "The build directory must contain exactly one file: index.html. Run this before generating checksums.",
  );
}
const html = await readFile(target, "utf8");
const failures = [];
let scripts = 0;
let styles = 0;
const isEmbedded = (value) => /^(?:data:|#)/i.test(value.trim());
const checkCss = (css) => {
  // CSS comments must not hide a remote URL. Strip them before inspection.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/@import\b/i.test(text)) failures.push("CSS @import is forbidden");
  for (const match of text.matchAll(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
  )) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (!isEmbedded(value)) failures.push(`External CSS resource: ${value}`);
  }
};
const visit = (node) => {
  const attrs = Object.fromEntries(
    (node.attrs || []).map(({ name, value }) => [name, value]),
  );
  if (node.tagName === "script") {
    scripts += 1;
    if ("src" in attrs) failures.push(`Script src is forbidden: ${attrs.src}`);
  }
  if (node.tagName === "link") {
    const rel = (attrs.rel || "").toLowerCase().split(/\s+/);
    if (
      rel.some((value) =>
        ["stylesheet", "modulepreload", "preload", "prefetch"].includes(value),
      )
    ) {
      failures.push(`External loading link is forbidden: ${attrs.rel}`);
    } else if (attrs.href && !isEmbedded(attrs.href))
      failures.push(`External link asset: ${attrs.href}`);
  }
  if (node.tagName === "style") {
    styles += 1;
    checkCss(
      (node.childNodes || []).map((child) => child.value || "").join(""),
    );
  }
  if (attrs.style) checkCss(attrs.style);
  for (const attr of ["src", "poster", "data"]) {
    if (node.tagName !== "script" && attrs[attr] && !isEmbedded(attrs[attr]))
      failures.push(`External ${node.tagName} ${attr}: ${attrs[attr]}`);
  }
  if (attrs.srcset) failures.push("Static srcset must be inlined or removed");
  for (const child of node.childNodes || []) visit(child);
  if (node.content) visit(node.content);
};
visit(parse(html));
if (!scripts) failures.push("No inline JavaScript found");
if (!styles) failures.push("No inline stylesheet found");
if (failures.length)
  throw new Error(
    `Single-file verification failed:\n${failures.map((value) => `- ${value}`).join("\n")}`,
  );
console.log(
  `Verified ${target}: ${Buffer.byteLength(html).toLocaleString()} bytes; ${scripts} inline script(s), ${styles} inline stylesheet(s), no static external assets.`,
);
