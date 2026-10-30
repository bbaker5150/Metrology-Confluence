# Confluence-informed interface and editor review

Reviewed 2026-10-30 against public Atlassian Confluence Cloud documentation. The linked pages were fetched successfully and their article text inspected. This is a design reference for Metrology Confluence, not a claim of feature parity or an Atlassian integration.

## Observed Confluence patterns

| Official source | Observed behavior | Application to this hub |
| --- | --- | --- |
| [New navigation](https://support.atlassian.com/confluence-cloud/docs/what-is-the-new-navigation-in-confluence/) | The sidebar carries For you, Recent, Starred, and Spaces. A space's content tree appears when that space is open. Search and Create are global controls. Less common navigation and settings live under More. | Keep one global page-creation action, one search entry point, and a focused space/page hierarchy. Use the suite's real MetSoft medallion for identity. |
| [Format with the toolbar](https://support.atlassian.com/confluence-cloud/docs/add-formatting-to-your-page/) | Selecting text reveals a floating toolbar; users can pin the toolbar. Elements are also available by typing `/`. Undo and redo have keyboard shortcuts. Atlassian explicitly notes that editing controls are rolling out and may differ across sites. | Make editing visual by default. Keep common formatting accessible, put less common insertion choices behind a menu, and preserve keyboard undo/redo. Avoid a permanently crowded wall of controls. |
| [Format text](https://support.atlassian.com/confluence-cloud/docs/format-text/) | Paragraph/headings, bold, italic, underline, strikethrough, inline code, subscript, superscript, lists, alignment, text color, and highlighting are supported. Several secondary styles are grouped in a more-formatting menu. | Support the useful text styles directly on the document. Subscript/superscript matter for units and scientific notation. Keep paragraph style and the most-used marks in the main toolbar. |
| [Add elements](https://support.atlassian.com/confluence-cloud/docs/insert-elements-into-a-page/) | `/` inserts elements such as code snippets, action items, panels, quotes, dividers, emoji, and headings. Code snippets support language selection, syntax highlighting, line numbering, and wrapping. Panels distinguish info, note, error, success, and warning. | Provide an Insert menu and slash discovery for practical document building blocks. Make code a real block with a language control; use contextual controls rather than separate permanent buttons for each panel type. |
| [Images, videos, and files](https://support.atlassian.com/confluence-cloud/docs/work-with-images-videos-and-files/) | Files can be uploaded through the toolbar, `/image`, or drag and drop. Selecting media exposes sizing, alignment, caption, border, link, and alt-text controls. | Add images from the editor with accessible descriptions. Keep image settings near the selected image. Preserve ordinary SharePoint attachments as the storage mechanism where applicable. |
| [Symbols and emoji](https://support.atlassian.com/confluence-cloud/docs/use-symbols-emojis-and-special-characters/) | Emoji can be inserted from a toolbar item or `:` shortcut. The current Cloud editor has removed its dedicated special-character picker; the docs recommend operating-system character tools. | Offer a compact built-in palette for metrology symbols such as ±, µ, °, Ω, ≤, ≥, and Greek letters, plus common emoji. This is a deliberate improvement for this domain, not a claim that current Confluence Cloud has the same symbol picker. |

The legacy [Code Block macro](https://support.atlassian.com/confluence-cloud/docs/insert-the-code-block-macro/) documentation was also inspected, but the current editor's code-snippet behavior above is the relevant model. Do not build the new editor around legacy macro markup.

## Problems identified in the previous interface

- Page creation was repeated in the global top bar, section header, empty list, and decorative knowledge-tip card. Keep a single reliable global action, with a contextual empty-state action only when it materially helps the first-use path.
- Space creation appeared both beside the sidebar Spaces label and beside the dashboard's space cards. Choose one clear primary location.
- Version history appeared twice in the article header: a clickable version badge and a separate history icon. A passive version label and a single menu item are clearer.
- Pin, history, export, print, and edit all competed in one article action row. Keep Edit prominent; group the secondary actions under a labeled More menu.
- Large marketing copy, several uppercase eyebrows, four metric tiles, and a decorative encouragement card consumed space that could show useful documents and spaces.
- The app used a generated book mark while the homepage and sibling tools use the actual MetSoft medallion.
- The split Markdown editor exposed syntax and many metadata fields before the writing surface. A visual editor should lead, while page settings and source editing remain available as secondary tools.

## Recommended information hierarchy

1. **Shell:** real suite emblem; compact workspace identity; persistent Search and one Create action; simple Home, Recent, Pinned, and Drafts navigation; space tree.
2. **Home:** short title and useful context; a small set of essential articles; spaces; recently updated documents. Show counts inline rather than as a large metrics dashboard.
3. **Reader:** breadcrumbs, title, concise author/editor metadata, tags, one Edit action, and a More menu. Keep the content and table of contents dominant.
4. **Editor:** document title followed immediately by a visual canvas and restrained toolbar. Group paragraph styles, common text formatting, lists, links, and Insert. Reveal table/image/code options when relevant. Put parent, summary, tags, template, and revision note in page details rather than above the document.
5. **Saving:** clear Draft/Publish choices and visible failure feedback. Do not imply real-time multiplayer collaboration, automatic SharePoint saves, or approval workflows that the backend does not implement.

## Implementation boundaries

Reuse interaction principles while retaining the suite's existing colors, typography, and spacing. The application still ships as one self-contained HTML file and uses SharePoint Lists. Existing Markdown pages, revisions, and exports must remain readable; richer editing must not silently discard old content. User-entered links and rich HTML require sanitization. Continue to verify the final bundle in a surrounding SharePoint ASP.NET form so editor controls never cause host postbacks.
