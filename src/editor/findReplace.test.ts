// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  findDocumentMatches,
  getDocumentSearchState,
  SearchReplace,
} from "./findReplace";

const AtomicStatus = Node.create({
  name: "testStatus",
  group: "inline",
  inline: true,
  atom: true,
  parseHTML: () => [{ tag: "span[data-status]" }],
  renderHTML: () => ["span", { "data-status": "approved" }, "Approved"],
});

const editors: Editor[] = [];
function create(content: string) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Link, AtomicStatus, SearchReplace],
    content,
  });
  editors.push(editor);
  return editor;
}
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("document find and replace", () => {
  it("maps matches across inline marks without crossing blocks, hard breaks, or atoms", () => {
    const editor = create(
      "<p><strong>cal</strong><em>ibration</em> record</p>" +
        "<p>cal</p><p>ibration</p><p>cal<br>ibration</p>" +
        '<p>cal<span data-status="approved">Approved</span>ibration</p>',
    );
    const matches = findDocumentMatches(editor.state.doc, "calibration");
    expect(matches).toEqual([{ from: 1, to: 12 }]);
    editor.commands.setDocumentSearch("calibration");
    expect(getDocumentSearchState(editor).matches).toEqual(matches);
    expect(
      editor.view.dom.querySelectorAll(".document-find-match").length,
    ).toBe(2);
    expect(findDocumentMatches(editor.state.doc, "Approved")).toEqual([]);
  });

  it("treats search strings literally, and keeps URLs and node attributes out of search", () => {
    const editor = create(
      '<p>a+b aab .* text</p><p><a href="https://example.com/calibration">Manual</a></p>',
    );
    expect(findDocumentMatches(editor.state.doc, "a+b")).toHaveLength(1);
    expect(findDocumentMatches(editor.state.doc, ".*")).toHaveLength(1);
    expect(findDocumentMatches(editor.state.doc, "calibration")).toHaveLength(
      0,
    );
    expect(findDocumentMatches(editor.state.doc, "Manual")).toHaveLength(1);
  });

  it("supports case and Unicode word boundaries with correct original positions", () => {
    const editor = create(
      "<p>calibration Calibration calibration2 pre_calibration Ω Ωx μΩ İ calibration</p>",
    );
    expect(findDocumentMatches(editor.state.doc, "calibration")).toHaveLength(
      5,
    );
    expect(
      findDocumentMatches(editor.state.doc, "calibration", { matchCase: true }),
    ).toHaveLength(4);
    expect(
      findDocumentMatches(editor.state.doc, "calibration", { wholeWord: true }),
    ).toHaveLength(3);
    expect(
      findDocumentMatches(editor.state.doc, "Ω", { wholeWord: true }),
    ).toHaveLength(1);
    const matches = findDocumentMatches(editor.state.doc, "calibration");
    for (const match of matches) {
      expect(
        editor.state.doc.textBetween(match.from, match.to).toLowerCase(),
      ).toBe("calibration");
    }
    const dotted = findDocumentMatches(editor.state.doc, "i\u0307");
    expect(dotted).toHaveLength(1);
    expect(editor.state.doc.textBetween(dotted[0].from, dotted[0].to)).toBe(
      "İ",
    );
  });

  it("navigates with wraparound, replaces only the active match, and recomputes on edits", () => {
    const editor = create("<p>one one one</p>");
    editor.commands.setDocumentSearch("one");
    expect(getDocumentSearchState(editor).activeIndex).toBe(0);
    editor.commands.previousDocumentSearchMatch();
    expect(getDocumentSearchState(editor).activeIndex).toBe(2);
    editor.commands.nextDocumentSearchMatch();
    expect(getDocumentSearchState(editor).activeIndex).toBe(0);
    editor.commands.nextDocumentSearchMatch();
    editor.commands.replaceDocumentSearchMatch("two");
    expect(editor.getText()).toBe("one two one");
    expect(getDocumentSearchState(editor).matches).toHaveLength(2);
    expect(getDocumentSearchState(editor).activeIndex).toBe(1);
    editor.commands.insertContentAt(1, "one ");
    expect(getDocumentSearchState(editor).matches).toHaveLength(3);
    for (const match of getDocumentSearchState(editor).matches) {
      expect(editor.state.doc.textBetween(match.from, match.to)).toBe("one");
    }
  });

  it("replaces all in one undo step while preserving structure, surrounding marks and link URLs", () => {
    const editor = create(
      '<h2><strong>cal</strong><em>ibration</em> methods</h2><ul><li><p>calibration <strong>approved</strong></p></li></ul><p><a href="https://example.com/calibration">Resource</a></p>',
    );
    // Replacement must form its own undo event, separate from the preceding edit.
    editor.commands.insertContentAt(
      editor.state.doc.content.size - 1,
      " added",
    );
    const before = editor.getJSON();
    editor.commands.setDocumentSearch("calibration");
    editor.commands.replaceAllDocumentSearchMatches("inspection");
    expect(editor.getText()).toContain("inspection methods");
    expect(editor.getText()).toContain("inspection approved");
    expect(editor.getHTML()).toContain("<strong>approved</strong>");
    expect(editor.getHTML()).toContain(
      'href="https://example.com/calibration"',
    );
    expect(editor.getHTML()).toContain("<h2>");
    expect(editor.getHTML()).toContain("<ul>");
    expect(getDocumentSearchState(editor).matches).toHaveLength(0);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
    expect(getDocumentSearchState(editor).matches).toHaveLength(2);
    editor.commands.redo();
    expect(editor.getText()).toContain("inspection approved");
  });

  it("searches and replaces code as literal text without interpreting HTML", () => {
    const editor = create(
      "<pre><code>const oldName = 1;\noldName++;</code></pre>",
    );
    editor.commands.setDocumentSearch("oldName");
    editor.commands.replaceAllDocumentSearchMatches("<b>newName</b>");
    expect(editor.getText()).toContain("const <b>newName</b> = 1;");
    expect(editor.getHTML()).toContain("&lt;b&gt;newName&lt;/b&gt;");
    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
  });

  it("keeps immediate adjacent typing separate from the replacement undo event", () => {
    const editor = create("<p>one one</p>");
    editor.commands.setDocumentSearch("one");
    editor.commands.replaceAllDocumentSearchMatches("two");
    editor.commands.insertContentAt(4, "X");
    expect(editor.getText()).toBe("twoX two");
    editor.commands.undo();
    expect(editor.getText()).toBe("two two");
    editor.commands.undo();
    expect(editor.getText()).toBe("one one");
    editor.commands.redo();
    expect(editor.getText()).toBe("two two");
    editor.commands.redo();
    expect(editor.getText()).toBe("twoX two");
  });

  it("supports deleting matches and leaves nonmatches, empty searches, and command checks untouched", () => {
    const editor = create("<p>prefix one suffix</p>");
    const before = editor.getJSON();
    editor.commands.setDocumentSearch("");
    expect(editor.commands.replaceAllDocumentSearchMatches("danger")).toBe(
      false,
    );
    editor.commands.setDocumentSearch("missing");
    expect(editor.commands.replaceDocumentSearchMatch("danger")).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    editor.commands.setDocumentSearch("one");
    expect(editor.can().replaceAllDocumentSearchMatches("two")).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    editor.commands.replaceDocumentSearchMatch("");
    expect(editor.getText()).toBe("prefix  suffix");
  });

  it("clears decorations without changing the document or adding an undo event", () => {
    const editor = create("<p>one</p>");
    editor.commands.insertContentAt(4, " two");
    const before = editor.getJSON();
    editor.commands.setDocumentSearch("one");
    expect(
      editor.view.dom.querySelector(".document-find-match"),
    ).not.toBeNull();
    editor.commands.clearDocumentSearch();
    expect(editor.view.dom.querySelector(".document-find-match")).toBeNull();
    expect(editor.getJSON()).toEqual(before);
    editor.commands.undo();
    expect(editor.getText()).toBe("one");
  });

  it("does not allow replacement through a read-only editor", () => {
    const editor = create("<p>one</p>");
    editor.commands.setDocumentSearch("one");
    editor.setEditable(false);
    expect(editor.commands.replaceDocumentSearchMatch("two")).toBe(false);
    expect(editor.commands.replaceAllDocumentSearchMatches("two")).toBe(false);
    expect(editor.getText()).toBe("one");
  });
});
