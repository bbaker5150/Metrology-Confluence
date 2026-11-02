// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { createWordDocument } from "./exportWord";
import { createSeed } from "../data/seed";
import { serializeContent } from "./content";
async function unzip(blob: Blob) {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
  return unzipSync(new Uint8Array(buffer));
}
describe("portable Word export", () => {
  it("creates a real DOCX package with formatting, tables, checklists, code, and safe links", async () => {
    const page = {
      ...createSeed().pages[0],
      Title: "Reference & results",
      Content: serializeContent(
        '<h2>Method</h2><p><strong>Important</strong> H<sub>2</sub>O <a href="https://example.test/reference">Reference</a></p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Reviewed</p></li></ul><table><tr><th><p>Value</p></th></tr><tr><td><p>42 ± 1</p></td></tr></table><pre><code>print(42)</code></pre><details data-type="expand"><summary>Evidence</summary><div data-type="expandContent"><p>Verified</p></div></details>',
      ),
    };
    const { blob, warnings } = await createWordDocument(page);
    const files = await unzip(blob),
      xml = strFromU8(files["word/document.xml"]);
    expect(files["[Content_Types].xml"]).toBeDefined();
    expect(xml).toContain("Reference &amp; results");
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("☑ ");
    expect(xml).toContain("42 ± 1");
    expect(xml).toContain("print(42)");
    expect(xml).toContain("Verified");
    expect(strFromU8(files["word/_rels/document.xml.rels"])).toContain(
      "https://example.test/reference",
    );
    expect(warnings).toEqual([]);
  });
  it("retains unavailable images as descriptions/links and reports the limitation", async () => {
    const page = {
      ...createSeed().pages[0],
      Content: serializeContent(
        '<p><img src="https://external.test/lab.png" alt="Lab setup"></p><script>alert(1)</script><a href="javascript:alert(1)">Unsafe link</a>',
      ),
    };
    const { blob, warnings } = await createWordDocument(page);
    const files = await unzip(blob),
      xml = strFromU8(files["word/document.xml"]);
    expect(warnings).toHaveLength(1);
    expect(xml).toContain("[Image: Lab setup]");
    expect(xml).not.toContain("alert(1)");
    expect(strFromU8(files["word/_rels/document.xml.rels"])).not.toContain(
      "javascript:",
    );
  });
});
