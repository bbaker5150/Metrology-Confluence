# Reference application alignment

Discovery was completed and summarized before application scaffolding. Sources were cloned from the same GitHub account:

- [NPSL-Modernization-Tracker](https://github.com/bbaker5150/NPSL-Modernization-Tracker/tree/5f06385), inspected commit `5f06385`.
- [Metrology-Workbench](https://github.com/bbaker5150/Metrology-Workbench/tree/5ef2c07), inspected commit `5ef2c07`.
- [Uncertalytics](https://github.com/bbaker5150/Uncertalytics) was also inspected; the maintained SharePoint standalone implementation and naming conventions are in Workbench.

## Visual system

The siblings have related, but not identical, tokens. Metrology-Confluence retains Tracker's exact color tokens as its primary system, with Workbench's readable system sans and monospace fallbacks. The revised interface simplifies the shell and action hierarchy rather than copying every original layout dimension. No remote font, logo, or icon requests are needed.

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | `#f3f6fa` | `#07111c` |
| Surface | `#ffffff` | `#0d1a28` |
| Secondary surface | `#f8fafc` | `#101f2f` |
| Tertiary surface | `#eef3f8` | `#15283b` |
| Primary text | `#102033` | `#e7eef7` |
| Muted text | `#64748b` | `#96a8ba` |
| Border | `#dfe7f0` | `#203449` |
| Strong border | `#ccd8e5` | `#2c455f` |
| Sidebar | `#071522` | `#050d15` |
| Accent blue | `#207de9` | `#58a6ff` |
| Soft blue | `#e9f3ff` | `#122b45` |
| Success | `#22a885` | `#43c6a5` |
| Warning | `#dd8c16` | `#f2ad42` |
| Danger | `#dc5166` | `#ef7184` |

Tracker uses a 248px navy sidebar, 70px top bar, 28px main padding, 18px card/dialog radii, and 10–11px control radii. Its status pills use tinted backgrounds and rounded edges. Dialogs use a dark, blurred backdrop; toasts sit at bottom right. Source: [`src/styles.css`](https://github.com/bbaker5150/NPSL-Modernization-Tracker/blob/5f06385/src/styles.css).

Workbench uses canvas `#f5f7fb` / `#0b1220`, accent `#2563eb` / `#60a5fa`, and a more compact 40px shell top bar. Its Inter/system UI and monospace conventions inform article readability. Sources: `Frontend/workbench/src/modules/uncertainty/App.css`, `src/app/workbench.css`, and `src/shared/fonts/fonts.css`.

## Shared logo provenance

The interface now uses the suite's actual medallion, copied unchanged from [`Metrology-Software-Homepage/emblem-preview.webp`](https://github.com/bbaker5150/Metrology-Software-Homepage/blob/49fde8b692a4f1080bf9ade2aa3dc74ca8eaa159/emblem-preview.webp) into `src/assets/metsoft-emblem.webp`. The homepage documents its source as Workbench's `Frontend/workbench/src/assets/emblem-preview.webp`. The copied file is byte-identical to the homepage asset, with SHA-256:

```text
8ca4a45d827c21e7c6f9323e625b8714b43e6f11436f77d7dce054bc353af547
```

Vite embeds this local image in the final HTML. It is used in the sidebar identity and home/empty-state treatment; the generic book logo has been removed.

## Interface and editor revision

The [Confluence design review](confluence-design-review.md) records the official Atlassian documentation inspected for the second design pass. The resulting application uses one global **Create** menu for **Page** and **Space**, a focused space tree, a quieter home dashboard, and **Workspace settings** for site administration. Article history, copying a link, export, and print are grouped in **More page actions**; Edit and pin remain immediately available.

A visual Tiptap editor replaces the default Markdown split view. It provides text formatting, tables with contextual row/column controls, action lists, callout panels, code blocks with a language selector, links, symbols/emoji, and inline images. Images can come from URLs, existing attachments, file upload, clipboard paste, or drag/drop. Selected images expose description and width controls. A metrology-oriented symbol palette deliberately goes beyond current Confluence Cloud's reliance on operating-system special-character tools.

Existing Markdown pages and snapshots remain readable. Visual-editor saves use a versioned, sanitized HTML envelope in the existing `Content` and `ContentSnapshot` text fields. Markdown export converts that content; switching to source mode is optional and warns about possible formatting simplification. There is no list-schema migration and no automatic rewrite of untouched pages.

The editor shows unsaved status and saves only on an explicit user action. It does not implement real-time multiplayer editing. Image uploads are staged until saving; a new page may need an initial Draft before its images can become SharePoint attachments. Partial failures retain editing context and surface recovery instructions because list writes and attachment uploads are not one transaction.

## SharePoint conventions

Reference sources: Tracker `src/lib/spContext.js`, `src/lib/spStore.js`, `src/lib/trackerLists.js`; Workbench `Frontend/workbench/src/standalone/sharepoint/spContext.js` and `spStore.js`.

- Authentication uses the current SharePoint session and credentialed requests. No application token is embedded in the HTML.
- REST v1 JSON requests use `application/json;odata=nometadata`; field XML creation uses verbose OData metadata where SharePoint requires it.
- Writes obtain a form digest from `POST /_api/contextinfo`, cache it by site, and refresh it before the reported expiry.
- Updates and deletes use `POST` with `X-HTTP-Method` and `IF-MATCH` headers.
- Errors distinguish permission failures, missing resources, and malformed responses. Empty write responses are valid.
- Site discovery checks SharePoint page context and same-origin parent context. This app additionally accepts an explicit same-origin `?siteUrl=` for standalone hosts without page context.
- Production failures do not switch into local demo storage.
- Display titles group lists by product: **`Uncertalytics - Sessions`** and **`Modernization-Tracker - Projects`**. Tracker resolves legacy aliases and refuses ambiguous duplicate lists.

Metrology-Confluence therefore creates **`Metrology-Confluence - Spaces`**, **`Metrology-Confluence - Pages`**, **`Metrology-Confluence - Versions`**, and **`Metrology-Confluence - Comments`**. It recognizes the prompt's `KB_*` titles as existing-list aliases. It does not create duplicate replacement lists or rename existing lists silently.

## Build conventions and adaptations

The siblings currently use React 19.2.8, Vite 6.4.5, and Node 22 in Actions. This new app follows the requested React 18 + TypeScript architecture. Workbench uses `vite-plugin-singlefile`; Tracker has a custom inliner. Both inline assets, disable CSS splitting and public directory copying, and publish downloadable single-file releases with checksums.

This repository uses `vite-plugin-singlefile`, a locked dependency install, TypeScript checking, focused tests, an HTML parser based standalone-file verifier, and a browser smoke test of the compiled output. Pull requests build artifacts; successful main and tag builds publish releases. Main releases use `build-<short SHA>`, matching the sibling convention.
