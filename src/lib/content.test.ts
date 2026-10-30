// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  RICH_PREFIX,
  contentText,
  isRichContent,
  sanitizeContentHTML,
  serializeContent,
  toEditorHTML,
  toMarkdown,
} from "./content";

describe("rich article compatibility and security", () => {
  it("keeps old Markdown editable with native task and callout structure", () => {
    const html = toEditorHTML(
      "## Procedure\n\n> [!WARNING]\n> Disconnect power.\n\n- [x] Record result\n- [ ] Review report\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
    );
    expect(html).toContain("<h2>Procedure</h2>");
    expect(html).toContain('data-callout="warning"');
    expect(html).not.toContain("[!WARNING]");
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    expect(html).toContain("<table>");
  });
  it("strips active markup and unsupported CSS/URLs from rich saves", () => {
    const content = serializeContent(
      '<p style="text-align:center;position:fixed;color:red" onclick="alert(1)">Good <strong>text</strong></p><script>alert(1)</script><svg onload="alert(1)"></svg><a href="javascript:alert(1)">link</a><img src="data:image/svg+xml;base64,PHN2Zy8+" onerror="alert(1)"><iframe src="https://evil.example"></iframe>',
    );
    expect(isRichContent(content)).toBe(true);
    expect(content).not.toMatch(
      /script|onclick|onerror|<svg|iframe|javascript|position:|color:/,
    );
    expect(content).toContain("text-align: center");
    expect(content).toContain("<strong>text</strong>");
    expect(content).not.toContain("data:image/svg");
  });
  it("retains symbols, code, extended text, image sizing and safe alignment", () => {
    const content = serializeContent(
      '<p>± μ Ω <u>underlined</u> H<sub>2</sub>O x<sup>2</sup> <mark>review</mark></p><pre><code class="language-python">print(&quot;hello&quot;)</code></pre><img src="/sites/metsoft/Attachments/image.png" width="50%" data-align="center" alt="Sensor">',
    );
    const html = toEditorHTML(content);
    expect(html).toContain("± μ Ω");
    expect(html).toContain("language-python");
    expect(html).toContain('width="50%"');
    expect(html).toContain('data-align="center"');
    expect(contentText(content)).toContain("underlined H2O x2 review");
    expect(contentText(content)).toContain("Sensor");
  });
  it("exports rich tables, tasks, code and callouts as useful Markdown", () => {
    const original =
      "## Calibration\n\n> [!TIP]\n> Keep records.\n\n- [x] Ready\n\n```python\nprint(42)\n```\n\n| Check | Result |\n| --- | --- |\n| Zero | Pass |";
    const markdown = toMarkdown(serializeContent(toEditorHTML(original)));
    expect(markdown).toContain("## Calibration");
    expect(markdown).toContain("> [!TIP]");
    expect(markdown).toContain("- [x] Ready");
    expect(markdown).toContain("```python");
    expect(markdown).toContain("print(42)");
    expect(markdown).toContain("| Check | Result |");
    expect(markdown).not.toContain(RICH_PREFIX);
  });
  it("preserves resized and merged table column widths across rich save and reopen", () => {
    const original =
      '<table><tbody><tr><th colspan="1" colwidth="240"><p>Reference</p></th><th colspan="2" colwidth="160,0"><p>Measurements</p></th></tr><tr><td colwidth="240"><p>Sensor</p></td><td colwidth="160"><p>12</p></td><td><p>Pass</p></td></tr></tbody></table>';
    const reopened = toEditorHTML(serializeContent(original));
    expect(reopened).toContain('colwidth="240"');
    expect(reopened).toContain('colwidth="160,0"');
    expect(reopened).toContain('colspan="2"');
    expect(toEditorHTML(serializeContent(reopened)).trim()).toBe(
      reopened.trim(),
    );
  });
  it("rejects invalid table widths and bounds spans before rendering", () => {
    const html = sanitizeContentHTML(
      '<table><tbody><tr><td colwidth="100px"><p>A</p></td><td colwidth="1,2"><p>B</p></td><td colwidth="10000"><p>C</p></td><td colspan="99999" colwidth="60"><p>D</p></td><td colwidth="-5"><p>E</p></td></tr></tbody></table><p colwidth="100">Text</p>',
    );
    const template = document.createElement("template");
    template.innerHTML = html;
    const cells = template.content.querySelectorAll("td");
    expect(cells[0].hasAttribute("colwidth")).toBe(false);
    expect(cells[1].hasAttribute("colwidth")).toBe(false);
    expect(cells[2].hasAttribute("colwidth")).toBe(false);
    expect(cells[3].hasAttribute("colspan")).toBe(false);
    expect(cells[3].getAttribute("colwidth")).toBe("60");
    expect(cells[4].hasAttribute("colwidth")).toBe(false);
    expect(template.content.querySelector("p[colwidth]")).toBeNull();
  });
  it("retains same-origin temporary images only for the editing and upload handoff", () => {
    const preview = `blob:${location.origin}/image-preview`;
    const content = serializeContent(
      `<p>Reference</p><img src="${preview}" alt="Draft image">`,
    );
    expect(toEditorHTML(content)).toContain(preview);
    expect(
      sanitizeContentHTML(content.slice(RICH_PREFIX.length)),
    ).not.toContain(preview);
    expect(
      serializeContent('<img src="blob:https://untrusted.example/preview">'),
    ).not.toContain("blob:");
  });
  it("keeps task checkbox rendering consistent with the stored task state", () => {
    const html = sanitizeContentHTML(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" checked></label><div><p>Pending</p></div></li><li data-type="taskItem" data-checked="true"><label><input type="checkbox"></label><div><p>Done</p></div></li></ul>',
    );
    const template = document.createElement("template");
    template.innerHTML = html;
    const boxes = template.content.querySelectorAll<HTMLInputElement>("input");
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
    expect(Array.from(boxes).every((box) => box.disabled)).toBe(true);
  });
  it("leaves legacy content intact when exporting and excludes unsafe images from rendering", () => {
    const markdown = "# A legacy page\n\n[Link](https://example.com)";
    expect(toMarkdown(markdown)).toBe(markdown);
    expect(
      sanitizeContentHTML(
        '<img src="javascript:alert(1)"><img src="blob:https://elsewhere.example/123">',
      ),
    ).not.toMatch(/src=/);
  });
});
