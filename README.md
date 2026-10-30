# Metrology Confluence

A lightweight internal knowledge hub for the metrology software suite. React 18, TypeScript, Tailwind, and Vite compile to one portable **`dist/index.html`**. JavaScript, CSS, and Lucide SVG icons are embedded; article attachments and SharePoint data are fetched from the connected site at runtime.

[Download the latest HTML](https://github.com/bbaker5150/Metrology-Confluence/releases/latest/download/index.html) · [Builds](https://github.com/bbaker5150/Metrology-Confluence/actions/workflows/build-sharepoint-html.yml) · [Reference-app discovery](docs/discovery.md)

## Features

- Spaces, nested pages, pinned articles, recent updates, personal drafts, and topic browsing.
- Global command search (`Ctrl+K` / `Cmd+K`) with space, status, tag, and date filters.
- Markdown editor with formatting tools, split preview, tables, checklists, code blocks, callouts, and five starter templates.
- Article breadcrumbs, metadata, heading navigation, code copy, attachments, comments, Markdown export, and print/PDF layout.
- Revision snapshots with preview and restore; a restored revision becomes a new saved version.
- Light/dark themes aligned with Modernization Tracker, responsive navigation, and setup tools.
- Seeded browser-local demo storage for development; SharePoint REST v1 and Lists for deployment.

## Local development

Use Node.js **22** and npm.

```sh
npm ci
npm run dev
```

Open the Vite URL. Localhost uses seeded `localStorage` data and clearly displays local/demo mode. Changes persist in that browser and origin; they are not shared with SharePoint. Browser storage has finite capacity, especially for demo file attachments. Clearing the application's browser storage resets demo data.

```sh
npm run typecheck
npm test
npm run build
npm run verify
```

`npm run build` creates `dist/index.html` and verifies that the distribution contains exactly one file, inline JavaScript/CSS, and no static external asset references. Run the verifier before adding checksums or other files to `dist`.

The browser smoke test uses the final compiled artifact:

```sh
npx playwright install chromium
npm run test:browser
```

## SharePoint deployment

1. Download `index.html` from a successful [release](https://github.com/bbaker5150/Metrology-Confluence/releases), or build it locally. Optionally compare its SHA-256 with the release's `index.html.sha256`.
2. Upload the file to your organization's approved application location in the target SharePoint site, such as a Document Library or Site Assets.
3. Open it through a host that is permitted to execute the HTML and inline scripts. The browser must retain the target site's origin and authenticated SharePoint session.
4. Confirm the application displays **SharePoint mode** and the intended site before entering production content. If page context is absent, append an explicit site URL, for example:

   ```text
   https://tenant.sharepoint.com/sites/Metrology/SiteAssets/index.html?siteUrl=https%3A%2F%2Ftenant.sharepoint.com%2Fsites%2FMetrology
   ```

5. As a site owner or user with **Manage Lists**, open **Admin / Setup**, check readiness, and provision missing lists and columns. Alternatively use the PowerShell helper below.
6. Create your production spaces and articles. Demo content is not automatically copied into production.

**Hosting depends on SharePoint policy.** SharePoint Online often downloads `.html` files or blocks custom scripts instead of executing them. Uploading an HTML file does not itself establish a runnable application. Use an organization-approved host, such as a permitted classic page/embedding solution or the same trusted HTML host used for the sibling applications. A modern Script Editor/SPFx wrapper or tenant policy change may be needed; this repository does not install one or change tenant policies. Cross-origin or opaque sandbox frames cannot reuse the site's REST session. A Content Security Policy that forbids inline scripts is incompatible with this single-file distribution.

The adapter checks local and same-origin parent `_spPageContextInfo`. An explicit `siteUrl` must be on the same origin. Outside SharePoint context the app uses local mode; API errors after selecting SharePoint mode remain visible and **never** switch writes into demo storage. When opening standalone HTML on SharePoint without context, supply `siteUrl` and verify the mode indicator.

## List naming and schema

The current sibling convention is product-prefixed display names, such as `Uncertalytics - Sessions` and `Modernization-Tracker - Projects`. This app follows that convention:

| Canonical list title | Recognized existing alias | Purpose |
| --- | --- | --- |
| `Metrology-Confluence - Spaces` | `KB_Spaces` | Workspaces and departments |
| `Metrology-Confluence - Pages` | `KB_Pages` | Hierarchical Markdown articles |
| `Metrology-Confluence - Versions` | `KB_Versions` | Article revision snapshots |
| `Metrology-Confluence - Comments` | `KB_Comments` | Page discussion |

Provisioning creates canonical names. Existing `KB_*` lists are reused; they are not renamed or replaced. If both names exist for one list, setup fails with an ambiguity error so an administrator can resolve it without guessing which data is authoritative.

`Id`, `Title`, `Created`, and `Modified` are built-in SharePoint fields. Custom fields retain the internal names from the requested schema:

| List | Custom columns |
| --- | --- |
| Spaces | `Slug` (Text, indexed), `Description` (Note), `IconName` (Text), `AccentColor` (Text), `SortOrder` (Number), `IsArchived` (Boolean) |
| Pages | `SpaceId` / `ParentPageId` (Number, indexed), `Content` / `Summary` (Note), `Tags` (Text, JSON array), `Status` (Choice: Draft, Published, Archived; indexed), `IsPinned` (Boolean), `TemplateType` (Text), `VersionCount` (Number), `AuthorName` / `LastEditorName` (Text) |
| Versions | `PageId` (Number, indexed), `VersionNumber` (Number), `TitleSnapshot` (Text), `ContentSnapshot` (Note), `ChangeNote` / `EditedBy` (Text) |
| Comments | `PageId` (Number, indexed), `CommentBody` (Note), `AuthorName` (Text) |

Note columns store plain text; Markdown is the canonical article format. Text columns have SharePoint's 255-character limit, including the serialized tag array. Number relationships keep the REST payload compact; they are application-level references, not SharePoint Lookup columns. The Pages list enables attachments and native SharePoint versioning in addition to the application's Versions list. The schema source is [`src/services/schema.ts`](src/services/schema.ts).

Provisioning is repeatable and creates missing schema only. It does not delete columns, overwrite articles, seed production content, or grant permissions. Existing incompatible field types must be repaired by an administrator.

### PowerShell provisioning

The standalone REST helper requires PowerShell 7 and a SharePoint access token for the target site. Acquire the token using your organization's approved authentication flow; the script does not register an app or request tenant consent. Its caller needs Manage Lists on the site.

```powershell
$token = Read-Host 'SharePoint access token' -AsSecureString
./scripts/provision-sharepoint.ps1 -SiteUrl 'https://tenant.sharepoint.com/sites/Metrology' -AccessToken $token
```

The helper uses the same canonical titles, aliases, fields, digest handling, and duplicate-list checks as the UI. It can be rerun after a partial setup failure. See the script's parameter help for supported authentication inputs.

## Data, permissions, and editing

The browser uses the current SharePoint login and credentialed REST requests. There is no secret in the HTML, no custom backend, and no application service account. SharePoint list and item permissions remain the authorization boundary. Give readers access to all four app lists; contributors need the relevant item and attachment permissions; only administrators should provision schema.

**Draft and Archived are workflow statuses, not security boundaries.** Users who can read an item through SharePoint can read its content regardless of its status. Use SharePoint permissions or a separate site for confidential material. Author/editor display-name fields are labels; SharePoint's built-in audit fields and permissions establish actual identity and access.

The service handles minimal/verbose OData responses, pagination, digest caching, and descriptive errors. Existing-page saves use the loaded ETag to detect conflicting edits. Reload a stale page before retrying a conflict. SharePoint does not provide one transaction across the Pages and Versions lists; native page history provides additional recovery if a snapshot operation fails. Do not blindly repeat a write after a network interruption: reload first to see whether it completed.

Markdown rendering does not enable raw HTML. Uploaded attachments remain ordinary SharePoint files; access depends on their parent item and site policy. External Markdown images and links, if used, are content dependencies and may need network access; the application's own JavaScript and CSS remain bundled. Downloading an article as Markdown exports its text, not an archive of attached files. Print/PDF uses the browser's print dialog.

Global search loads accessible articles into the browser for immediate title/body/tag/author matching. The adapter follows pagination, but this remains a lightweight hub: very large collections may require server-side SharePoint search and a different loading strategy. Test your site's list-view thresholds, permissions, file limits, and hosting policies before broad rollout.

## Repository layout

```text
src/
  components/           Article reader, editor, Markdown, dialogs
  data/                 Local demonstration content
  services/             SharePoint and local adapters; list schema
  types.ts              Shared data contracts
scripts/
  provision-sharepoint.ps1
  verify-singlefile.mjs
.github/workflows/build-sharepoint-html.yml
docs/discovery.md
```

## CI and releases

The workflow runs on pushes and pull requests to `main`, all tags, and manual dispatch. It installs with `npm ci`, checks TypeScript, runs focused tests, builds the single file, verifies its resource references, and runs browser smoke checks against the bundle. It uploads the HTML plus SHA-256 checksum as an artifact.

Successful `main` builds create/update a `build-<short SHA>` release; tag builds use the tag name. Pull requests never publish releases. The release job receives `contents: write`; build jobs use read-only repository permissions. GitHub Actions must be enabled and repository policy must allow release writes. Releases are downloads only: this workflow does not upload to SharePoint.

The stable download URL is:

```text
https://github.com/bbaker5150/Metrology-Confluence/releases/latest/download/index.html
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| HTML downloads or shows as text | Approved SharePoint host, library handling, and tenant custom-script policy |
| Local mode appears on SharePoint | Page context is absent; use the explicit same-origin `siteUrl` and reload |
| 401/403 or digest failure | Current session, same-origin host, site URL, and permissions; sign in again if needed |
| Lists or columns missing | Run Admin / Setup as a user with Manage Lists |
| Duplicate-list alias error | Resolve canonical/legacy duplicates; the app deliberately does not select one |
| Save conflict | Another edit changed the item; reload the latest article before editing again |
| Browser demo storage is full | Remove unnecessary local files or clear demo storage; production uses SharePoint |
| Release missing | Check the exact commit's workflow and repository release-write policy |
