import { describe, expect, it } from "vitest";
import { diffRevisionText, REVISION_DIFF_LIMITS } from "./revisionDiff";

describe("bounded revision comparison", () => {
  it("reports replacement lines in reading order with both revision line numbers", () => {
    const result = diffRevisionText(
      "## Procedure\nCheck the old range.\nRecord results.",
      "## Procedure\nCheck the approved range.\nRecord results.\nRequest review.",
    );
    expect(result).toEqual({
      limited: false,
      added: 2,
      removed: 1,
      rows: [
        {
          kind: "unchanged",
          text: "## Procedure",
          beforeLine: 1,
          afterLine: 1,
        },
        { kind: "removed", text: "Check the old range.", beforeLine: 2 },
        { kind: "added", text: "Check the approved range.", afterLine: 2 },
        {
          kind: "unchanged",
          text: "Record results.",
          beforeLine: 3,
          afterLine: 3,
        },
        { kind: "added", text: "Request review.", afterLine: 4 },
      ],
    });
  });

  it("handles initial creation, complete removal, and empty revisions", () => {
    expect(diffRevisionText("", "")).toEqual({
      rows: [],
      added: 0,
      removed: 0,
      limited: false,
    });
    expect(diffRevisionText("", "First line\n\nLast line").rows).toEqual([
      { kind: "added", text: "First line", afterLine: 1 },
      { kind: "added", text: "", afterLine: 2 },
      { kind: "added", text: "Last line", afterLine: 3 },
    ]);
    const removed = diffRevisionText("First line\nLast line", "");
    expect(removed.removed).toBe(2);
    expect(removed.rows.every((row) => row.kind === "removed")).toBe(true);
  });

  it("normalizes line endings without changing Unicode or Markdown punctuation", () => {
    const text = "## ±0.01 µm\r\n\r\n- [x] **Reviewed** Ω\r\n";
    const result = diffRevisionText(text, text.replace(/\r/g, "").trimEnd());
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.rows.map((row) => row.text)).toEqual([
      "## ±0.01 µm",
      "",
      "- [x] **Reviewed** Ω",
    ]);
  });

  it("keeps repeated-line comparisons deterministic and reconstructs both revisions", () => {
    const before = "start\nrepeat\nleft\nrepeat\nend";
    const after = "start\nrepeat\nright\nrepeat\nend";
    const result = diffRevisionText(before, after);
    expect(result).toEqual(diffRevisionText(before, after));
    expect(
      result.rows
        .filter((row) => row.kind !== "added")
        .map((row) => row.text)
        .join("\n"),
    ).toBe(before);
    expect(
      result.rows
        .filter((row) => row.kind !== "removed")
        .map((row) => row.text)
        .join("\n"),
    ).toBe(after);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
  });

  it("returns untrusted markup only as literal row text", () => {
    const markup = '<img src=x onerror="alert(1)"> <script>alert(2)</script>';
    expect(diffRevisionText("", markup).rows).toEqual([
      { kind: "added", text: markup, afterLine: 1 },
    ]);
  });

  it("declines oversized character, line, and matrix inputs without partial output", () => {
    for (const [before, after] of [
      ["x".repeat(REVISION_DIFF_LIMITS.characters + 1), ""],
      [
        "",
        Array.from(
          { length: REVISION_DIFF_LIMITS.lines + 1 },
          () => "line",
        ).join("\n"),
      ],
      [
        Array.from({ length: 1000 }, (_, i) => `before${i}`).join("\n"),
        Array.from({ length: 1000 }, (_, i) => `after${i}`).join("\n"),
      ],
    ]) {
      const result = diffRevisionText(before, after);
      expect(result.limited).toBe(true);
      expect(result.rows).toEqual([]);
      expect(result.message).toMatch(/too large.*Preview/);
    }
  });

  it("compares a long mostly unchanged revision without a quadratic full-page matrix", () => {
    const before = Array.from({ length: 1000 }, (_, i) => `Line ${i}`);
    const after = [...before];
    after[500] = "Updated procedure";
    const result = diffRevisionText(before.join("\n"), after.join("\n"));
    expect(result.limited).toBe(false);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.rows.find((row) => row.kind === "added")).toEqual({
      kind: "added",
      text: "Updated procedure",
      afterLine: 501,
    });
  });
});
