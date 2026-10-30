// @vitest-environment jsdom
import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import Markdown, { extractHeadings } from "./Markdown";
import { serializeContent } from "../lib/content";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("rich section reading and printing", () => {
  it("renders collapsed accessible native sections, statuses and headings", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const content = serializeContent(
      '<details><summary>Evidence</summary><div data-type="expandContent"><h2>Results</h2><p><span data-type="status" data-tone="green">Verified</span></p></div></details>',
    );
    try {
      act(() => root.render(createElement(Markdown, { content })));
      expect(host.querySelector("details")?.open).toBe(false);
      expect(host.querySelector("details > summary")?.textContent).toBe(
        "Evidence",
      );
      expect(host.querySelector(".status-green")?.textContent).toBe("Verified");
      expect(extractHeadings(content)).toEqual([
        { id: "results", text: "Results", level: 2 },
      ]);
    } finally {
      act(() => root.unmount());
    }
  });
  it("prints all section bodies in multiple previews and restores each reader's exact disclosure state", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const content = serializeContent(
      "<details><summary>First</summary><p>Hidden evidence</p></details><details><summary>Second</summary><p>Visible evidence</p></details>",
    );
    try {
      act(() =>
        root.render(
          createElement(
            Fragment,
            null,
            createElement(Markdown, { content }),
            createElement(Markdown, { content, idPrefix: "preview-" }),
          ),
        ),
      );
      const details = Array.from(host.querySelectorAll("details"));
      details[1].open = true;
      details[2].open = true;
      act(() => window.dispatchEvent(new Event("beforeprint")));
      expect(details.every((section) => section.open)).toBe(true);
      // Some browsers invoke beforeprint twice; the first snapshot must survive.
      act(() => window.dispatchEvent(new Event("beforeprint")));
      act(() => window.dispatchEvent(new Event("afterprint")));
      expect(details.map((section) => section.open)).toEqual([
        false,
        true,
        true,
        false,
      ]);
    } finally {
      act(() => root.unmount());
    }
  });
});
