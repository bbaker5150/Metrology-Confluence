// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Page } from "../types";
import { RICH_PREFIX } from "./content";
import { extractPageLinkIds, getPageConnections } from "./pageLinks";

const host =
  "https://tenant.sharepoint.com/sites/metsoft/SitePages/Knowledge.aspx";
function page(Id: number, Title: string, options: Partial<Page> = {}): Page {
  return {
    Id,
    Title,
    SpaceId: 1,
    ParentPageId: null,
    Content: "",
    Summary: "",
    Tags: [],
    Status: "Published",
    IsPinned: false,
    TemplateType: "blank",
    VersionCount: 1,
    AuthorId: 1,
    AuthorName: "Author",
    LastEditorName: "Author",
    Created: "2026-11-02T00:00:00Z",
    Modified: "2026-11-02T00:00:00Z",
    ...options,
  };
}

describe("internal page links", () => {
  it("reads actual Markdown links and reference links, deduplicating destinations", () => {
    const content = `See [Procedure](#page=2) and [same page](#page=2).

[Reference][reference]

[reference]: ${host}#page=3

Plain #page=4 and \`[example](#page=5)\` are not links.

\`\`\`html
<a href="#page=6">Example</a>
\`\`\`

![An image is not a page link](#page=7)`;
    expect(extractPageLinkIds(content, host)).toEqual([2, 3]);
  });

  it("reads sanitized rich links inside expandable content and ignores code anchors", () => {
    const content =
      RICH_PREFIX +
      '<details><summary>Evidence</summary><div data-type="expandContent"><p><a href="#page=2">Reference</a></p></div></details><pre><code><a href="#page=3">Example</a></code></pre><script>location.href="#page=4"</script><a href="javascript:alert(1)">Unsafe</a>';
    expect(extractPageLinkIds(content, host)).toEqual([2]);
  });

  it("rejects external, other-host-page, malformed, credential-bearing, and ambiguous targets", () => {
    const content =
      RICH_PREFIX +
      [
        "https://external.example/Knowledge.aspx#page=2",
        "https://tenant.sharepoint.com/sites/other/Knowledge.aspx#page=3",
        "https://user@tenant.sharepoint.com/sites/metsoft/SitePages/Knowledge.aspx#page=4",
        "#page=0",
        "#page=-1",
        "#page=1.5",
        "#page=2&page=3",
        "#page=9007199254740993",
        "#section",
        "mailto:someone@example.com#page=9",
        "#page=8",
      ]
        .map((href) => `<a href="${href}">Link</a>`)
        .join("");
    expect(extractPageLinkIds(content, host)).toEqual([8]);
    expect(extractPageLinkIds("[link](#page=1)", "invalid base")).toEqual([]);
  });

  it("keeps explicit site connection queries scoped to this workspace", () => {
    const query =
      "?siteUrl=https%3A%2F%2Ftenant.sharepoint.com%2Fsites%2Fmetsoft";
    const otherQuery =
      "?siteUrl=https%3A%2F%2Ftenant.sharepoint.com%2Fsites%2Fother";
    const content = `[Local](#page=2) [Same host](${host}${query}#page=3) [Other web](${host}${otherQuery}#page=4) [Missing context](${host}#page=5)`;
    expect(extractPageLinkIds(content, host + query)).toEqual([2, 3]);
  });
});

describe("connected accessible pages", () => {
  it("separates direct children, incoming references, and outgoing references in title order", () => {
    const current = page(1, "Current", {
      Content:
        "[Zulu](#page=3) [Alpha](#page=2) [Self](#page=1) [Missing](#page=99) [Archived](#page=4)",
    });
    const pages = [
      current,
      page(2, "Alpha", { ParentPageId: 1, Content: "[Current](#page=1)" }),
      page(3, "Zulu", { ParentPageId: 1 }),
      page(4, "Archived", {
        Status: "Archived",
        ParentPageId: 1,
        Content: "[Current](#page=1)",
      }),
      page(5, "Beta", {
        Content: RICH_PREFIX + '<p><a href="#page=1">Current</a></p>',
      }),
      page(6, "Nested child", { ParentPageId: 2 }),
      page(7, "Draft reference", {
        Status: "Draft",
        Content: "[Current](#page=1)",
      }),
    ];
    const connections = getPageConnections(current, pages, host);
    expect(connections.children.map((p) => p.Id)).toEqual([2, 3]);
    expect(connections.incoming.map((p) => p.Id)).toEqual([2, 5, 7]);
    expect(connections.outgoing.map((p) => p.Id)).toEqual([2, 3]);
  });

  it("never infers access to missing or archived source pages", () => {
    const current = page(1, "Current", { Content: "[Other](#page=2)" });
    const other = page(2, "Other", { Content: "[Current](#page=1)" });
    const empty = { children: [], incoming: [], outgoing: [] };
    expect(getPageConnections(current, [other], host)).toEqual(empty);
    expect(
      getPageConnections(
        { ...current, Status: "Archived" },
        [current, other],
        host,
      ),
    ).toEqual(empty);
    expect(
      getPageConnections(
        current,
        [current, { ...other, Status: "Archived" }],
        host,
      ),
    ).toEqual(empty);
  });

  it("deduplicates accessible records and does not count external lookalike links as backlinks", () => {
    const current = page(1, "Current", { Content: "[Other](#page=2)" });
    const other = page(2, "Other", {
      Content: "[Elsewhere](https://other.example/app#page=1)",
    });
    const result = getPageConnections(current, [current, other, other], host);
    expect(result.outgoing.map((p) => p.Id)).toEqual([2]);
    expect(result.incoming).toEqual([]);
  });
});
