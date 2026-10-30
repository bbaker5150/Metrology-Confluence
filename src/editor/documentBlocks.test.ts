// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import {
  ExpandableSection,
  ExpandContent,
  ExpandSummary,
  InlineStatus,
  createExpandSection,
} from "./documentBlocks";
import { serializeContent, toEditorHTML } from "../lib/content";

const extensions = [
  StarterKit,
  ExpandableSection,
  ExpandSummary,
  ExpandContent,
  InlineStatus,
];
describe("document blocks in the visual editor", () => {
  it("keeps rich body and status attributes through a save/reopen cycle", () => {
    const editor = new Editor({ extensions, content: "<p>Start</p>" });
    try {
      editor.commands.insertContent(
        createExpandSection("Calibration evidence"),
      );
      const expanded = editor
        .getJSON()
        .content!.find((node) => node.type === "expand")!;
      expect(expanded.content?.map((node) => node.type)).toEqual([
        "expandSummary",
        "expandContent",
      ]);
      const imported = toEditorHTML(
        serializeContent(
          '<details><summary>Calibration evidence</summary><div data-type="expandContent"><h2>Results</h2><p>Outcome: <span data-type="status" data-tone="green">Verified</span></p></div></details>',
        ),
      );
      editor.commands.setContent(imported);
      expect(
        editor.getJSON().content?.[0].content?.[1].content?.[1].content?.[1],
      ).toEqual({
        type: "status",
        attrs: { label: "Verified", tone: "green" },
      });
      expect(editor.getText()).toContain("Verified");
      expect(toEditorHTML(serializeContent(editor.getHTML()))).toBe(imported);
      const details = editor.view.dom.querySelector("details")!;
      expect(details.open).toBe(true);
      expect(editor.getHTML()).not.toContain(" open");
    } finally {
      editor.destroy();
    }
  });
  it("keeps title clicks editable and explicit collapse controls accessible", () => {
    const editor = new Editor({
      extensions,
      content: { type: "doc", content: [createExpandSection("Details")] },
    });
    try {
      const details = editor.view.dom.querySelector("details")!;
      const title = details.querySelector<HTMLElement>(".expand-editor-title")!;
      const button = details.querySelector("button")!;
      title.click();
      expect(details.open).toBe(true);
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === "paragraph")
          editor.commands.setTextSelection(position + 1);
      });
      button.click();
      expect(details.open).toBe(false);
      expect(editor.state.selection.$from.parent.type.name).toBe(
        "expandSummary",
      );
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(button.getAttribute("aria-label")).toBe("Expand section");
      button.click();
      expect(details.open).toBe(true);
      expect(button.getAttribute("aria-label")).toBe("Collapse section");
      button.click();
      expect(details.open).toBe(false);
      editor.commands.setTextSelection(2);
      editor.view.dom.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(details.open).toBe(true);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(editor.state.selection.$from.node(-1).type.name).toBe(
        "expandContent",
      );
    } finally {
      editor.destroy();
    }
  });
  it("normalizes status insertion and updates without exposing arbitrary attributes", () => {
    const editor = new Editor({
      extensions,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "status",
                attrs: { label: "  Needs\nreview  ", tone: "untrusted" },
              },
            ],
          },
        ],
      },
    });
    try {
      expect(editor.getHTML()).toBe(
        '<p><span data-type="status" data-tone="neutral">Needs review</span></p>',
      );
      editor.commands.setNodeSelection(1);
      expect(
        editor.commands.updateAttributes("status", {
          label: "Approved",
          tone: "green",
        }),
      ).toBe(true);
      expect(editor.getHTML()).toBe(
        '<p><span data-type="status" data-tone="green">Approved</span></p>',
      );
      expect(editor.getText()).toContain("Approved");
    } finally {
      editor.destroy();
    }
  });
});
