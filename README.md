# Metrology Confluence

A lightweight internal knowledge hub for the metrology software suite. React 18, TypeScript, Tailwind, and Vite compile to one portable **`dist/index.html`**. JavaScript, CSS, Lucide SVG icons, and the actual MetSoft medallion are embedded; article attachments and SharePoint data are fetched from the connected site at runtime.

[Download the latest HTML](https://github.com/bbaker5150/Metrology-Confluence/releases/latest/download/index.html) · [Builds](https://github.com/bbaker5150/Metrology-Confluence/actions/workflows/build-sharepoint-html.yml) · [Reference-app discovery](docs/discovery.md) · [Confluence design review](docs/confluence-design-review.md)

Preview the redesigned [home](docs/previews/home-light.webp), [dark theme](docs/previews/home-dark.webp), [visual editor](docs/previews/editor.webp), and [symbol picker](docs/previews/symbols.webp). These captures use seeded demonstration content.

## Features

- Spaces, nested pages, pinned articles, recent updates, personal drafts, and topic browsing.
- Global command search (`Ctrl+K` / `Cmd+K`) with space, status, tag, and date filters.
- Visual Tiptap editor with headings, bold/italic/underline, lists and action lists, links, undo/redo, and five starter templates.
- An Insert menu and `/` on an empty line for tables, code blocks, callouts, dividers, symbols, emoji, and images. Secondary formatting includes strikethrough, highlighting, inline code, subscript, superscript, and text alignment.
- Images from upload, paste, drag and drop, a URL, or existing page attachments, with description and width controls. Code blocks have a language selector; the reader adds syntax highlighting and copy controls.
- Article breadcrumbs, metadata, heading navigation, code copy, attachments, comments, Markdown export, and print/PDF layout.
- Revision snapshots with preview and restore; a restored revision becomes a new saved version. Creators can delete leaf pages through the app after confirmation.
- Light/dark suite themes, the shared MetSoft logo, a consolidated Create menu, a quieter article action bar, responsive navigation, and Workspace settings.
- Seeded browser-local demo storage for development; SharePoint REST v1 and Lists for deployment.

## Working in the hub

Use **Create → Space** to add a team or topic, then **Create → Page** to write its first article. The sidebar holds your spaces and nested pages; Home, Recent, Pinned, and My drafts provide quick ways back to useful content. Search is available in the top bar or with `Ctrl+K` / `Cmd+K`.

Pages open in a reading view with a clear **Edit page** action. **More page actions** contains version history, copying a page link, Markdown download, print/PDF, and **Delete page** for the original creator. Pinning remains a separate toggle. Site connection, list provisioning, and team access checks live in **Workspace settings**, visible only after SharePoint confirms site-owner access.

The visual editor occupies the main document area, keeping the workspace sidebar available. Select text to apply formatting, use **Insert** to add a block, or type `/` at the start of an empty paragraph. The symbol picker includes metrology characters such as `±`, `µ`, `Ω`, `°`, `σ`, `≤`, and `≥`, as well as common emoji. Select a table, code block, or image to reveal its relevant controls. **Page details** holds the summary, tags, parent page, and optional change note; new pages also offer five starter templates.

Use **Save draft**, **Publish page**, or **Save changes** to persist your edits. The footer shows unsaved changes and pending image uploads. There is **no automatic saving to SharePoint and no real-time collaborative editing**. Navigating elsewhere in the app with unsaved changes opens an in-app discard dialog; a browser navigation guard also runs where the host supports it. Sandboxed hosts may suppress the browser's native leave prompt. Replacing existing content with a template and switching to **More formatting → Markdown source** use in-app confirmation dialogs. Source conversion can simplify some visual formatting.

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

Browser checks include the final bundle mounted inside a simulated SharePoint ASP.NET form and an iframe that allows scripts but blocks native form submission, with mocked REST responses for first-space creation and permission failures. Save actions run directly from their buttons, and dialogs render outside the host form. Enter in single-line fields also invokes the action directly; Enter in a comment or description remains a newline. These checks do not replace validation on your live tenant.

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

5. As a site owner with **Manage Lists**, open **Workspace settings**, check readiness, and provision missing lists and columns. Alternatively use the PowerShell helper below.
6. In **Workspace settings → Team access**, select **Check team access**. If needed, select **Repair team access**, review the proposed scope, and choose **Apply shared access**. This gives the existing **Metrology App User** group shared access to this app's four lists and existing items with separate permissions. Members should refresh after repair completes. See the permission details below.
7. Use **Create → Space**, then **Create → Page** for production content. Demo content is not automatically copied into production.

Building or publishing this repository does **not** change permissions in your tenant. For an existing deployment, an owner must upload the new HTML and run the Team access steps above. The schema provisioning helper does not grant team access.

**Hosting depends on SharePoint policy.** SharePoint Online often downloads `.html` files or blocks custom scripts instead of executing them. Uploading an HTML file does not itself establish a runnable application. Use an organization-approved host, such as a permitted classic page/embedding solution or the same trusted HTML host used for the sibling applications. A modern Script Editor/SPFx wrapper or tenant policy change may be needed; this repository does not install one or change tenant policies. Cross-origin or opaque sandbox frames cannot reuse the site's REST session. A Content Security Policy that forbids inline scripts is incompatible with this single-file distribution.

The adapter checks local and same-origin parent `_spPageContextInfo`. An explicit `siteUrl` must be on the same origin. Outside SharePoint context the app uses local mode; API errors after selecting SharePoint mode remain visible and **never** switch writes into demo storage. When opening standalone HTML on SharePoint without context, supply `siteUrl` and verify the mode indicator.

## List naming and schema

The current sibling convention is product-prefixed display names, such as `Uncertalytics - Sessions` and `Modernization-Tracker - Projects`. This app follows that convention:

| Canonical list title | Recognized existing alias | Purpose |
| --- | --- | --- |
| `Metrology-Confluence - Spaces` | `KB_Spaces` | Workspaces and departments |
| `Metrology-Confluence - Pages` | `KB_Pages` | Hierarchical articles, including existing Markdown and visual-editor content |
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

Note columns continue to store plain text. Existing Markdown content remains readable without migration. Visual-editor saves store sanitized HTML inside a versioned text envelope beginning with `<!-- metrology-rich-text:v1 -->`; the same format is used in revision snapshots. This editor upgrade does not change list names or require new columns. Text columns have SharePoint's 255-character limit, including the serialized tag array. Number relationships keep the REST payload compact; they are application-level references, not SharePoint Lookup columns. The Pages list enables attachments and native SharePoint versioning in addition to the application's Versions list. The schema source is [`src/services/schema.ts`](src/services/schema.ts).

Provisioning is repeatable and creates missing schema only. It does not delete columns, overwrite articles, seed production content, or grant permissions. Existing incompatible field types must be repaired by an administrator.

### PowerShell provisioning

The standalone REST helper requires PowerShell 7 and a SharePoint access token for the target site. Acquire the token using your organization's approved authentication flow; the script does not register an app or request tenant consent. Its caller needs Manage Lists on the site.

```powershell
$token = Read-Host 'SharePoint access token' -AsSecureString
./scripts/provision-sharepoint.ps1 -SiteUrl 'https://tenant.sharepoint.com/sites/Metrology' -AccessToken $token
```

The helper uses the same canonical titles, aliases, fields, digest handling, and duplicate-list checks as the UI. It can be rerun after a partial setup failure. See the script's parameter help for supported authentication inputs.

## Data, permissions, and editing

The browser uses the current SharePoint login and credentialed REST requests. There is no secret in the HTML, no custom backend, and no application service account. SharePoint list and item permissions remain the authorization boundary. Team members need access to all four app lists, including the relevant item and attachment permissions; only administrators should provision schema or repair access.

Workspace settings uses the same owner-level permission rule as Modernization Tracker: a SharePoint site collection administrator, or a user with effective **Manage Permissions** access on the current site. Checking effective permissions supports inherited and nested security-group grants; list-level permissions and **Manage Lists** alone do not show the settings. Both the sidebar entry and the error-page shortcut remain hidden until this check succeeds. Failed or unknown checks and local/demo sessions do not expose settings. Application provisioning rechecks owner access and additionally requires **Manage Lists**; SharePoint still enforces the actual REST permissions. When automatic site detection is unavailable, an owner can supply the documented `siteUrl` query parameter to establish the connection.

### Shared team access

**Workspace settings → Team access** inspects the exact existing SharePoint group **Metrology App User**, all four resolved app lists, and every existing item with unique permissions. Repair requires verified owner access plus site-level **Manage Permissions** and **Manage Lists**. It uses the site's built-in Contribute permission level, rejects an unavailable or unsafe modified role, and does not create a substitute group or change group membership.

After the owner reviews and selects **Apply shared access**, repair grants Contribute where missing, sets `ReadSecurity = 1` and `WriteSecurity = 1` for shared reading and editing, and sets `DraftVersionVisibility = 0` so team readers can see shared drafts. If list inheritance must be broken to add the grant, existing assignments are copied and child scopes are retained. Existing Owners access, other grants, and content-approval settings are preserved. Changes apply only to the four app lists and existing unique item scopes; they do not grant site-wide access or access to the host page or HTML file. The app verifies the result. If repair stops partway, use **Check team access** again before retrying.

Membership in a shared group does not automatically give that group rights on every new app list. The inspected [Modernization Tracker permission service](https://github.com/bbaker5150/NPSL-Modernization-Tracker/blob/5f0638505f53aeea8eeb3fccb257d7542afed242/src/lib/trackerPermissions.js) applies grants to Tracker project, folder, and item scopes (`baselineGrants`, `applyScope`, and their callers); it does not configure these Confluence lists. Missing grants on the new lists are therefore a plausible cause when a member can use Tracker but cannot create a space here. Team access checks the current tenant state instead of assuming that diagnosis. Its implementation is [`src/services/groupAccess.ts`](src/services/groupAccess.ts).

### Deleting pages

Inside this app, **Delete page** is available only when SharePoint's native `AuthorId` matches the current user's numeric ID. The service fetches both again before deleting; editable author names are not ownership evidence, and site owners have no app-level override. A page with any child page, including a Draft or Archived child, cannot be deleted. Move or delete children first; there is no automatic recursive deletion. The child check and recycle request are separate SharePoint operations, not an atomic hierarchy constraint.

After confirmation, SharePoint pages and their attachments move to the SharePoint recycle bin. Separate Versions and Comments records remain available for a restored page. Local/demo deletion removes the page from that browser's workspace and has no undo or recycle bin. If a deletion response is uncertain, refresh and check the SharePoint recycle bin before trying again.

**Creator-only deletion is an application rule, not a SharePoint permission restriction.** Standard Contribute includes Delete Items, so members may delete other authors' content through native SharePoint or direct REST requests outside this app. Team access repair does not establish backend creator-only deletion security.

### Content and concurrent edits

**Draft and Archived are workflow statuses, not security boundaries.** Users who can read an item through SharePoint can read its content regardless of its status. Use SharePoint permissions or a separate site for confidential material. Author/editor display-name fields are labels; SharePoint's built-in audit fields and permissions establish actual identity and access.

The service handles minimal/verbose OData responses, pagination, digest caching, and descriptive errors. Existing-page saves use the loaded ETag to detect conflicting edits. Reload a stale page before retrying a conflict. SharePoint does not provide one transaction across the Pages and Versions lists; native page history provides additional recovery if a snapshot operation fails. Do not blindly repeat a write after a network interruption: reload first to see whether it completed.

The legacy Markdown reader does not execute raw HTML. Rich content and legacy content imported into the visual editor pass through an allowlist sanitizer that removes scripts, event handlers, unsupported URLs, and unrestricted styling. Markdown export converts visual content into Markdown, preserving common document structures; formatting that Markdown cannot represent may be simplified or represented by limited HTML tags. Export includes image references, not an archive of attached files. Print/PDF uses the browser's print dialog.

### Images and attachment saves

The editor accepts PNG, JPEG, GIF, and WebP files, up to **2 MB per image in local demo mode** and **10 MB per image in SharePoint mode**. Upload, clipboard paste, and drag/drop stage images in the current editor session; selecting an image exposes its description/alt text and 25%, 50%, 75%, or 100% width. An image URL or a previously attached image can also be inserted directly. These controls do not claim Confluence's full media feature set: this build does not provide video editing, image captions, border design tools, or arbitrary drag-handle image resizing.

Staged images become ordinary page attachments when you save. A new page with staged images first creates a Draft to obtain its SharePoint item ID, uploads the images, and then saves the final content with permanent attachment URLs and the selected status. An existing page retains its previous saved revision until that final content save. Temporary browser `blob:` image URLs are never persisted to the lists.

Page creation, attachment uploads, and revision snapshots are separate operations. A partial failure can leave an initial draft or successfully uploaded attachments behind. The editor retains the current text and remaining images and reports whether retrying is safe. An uncertain save response or conflicting edit blocks blind retries and asks you to reopen the latest page. Use the recovery download offered for an uncertain save to preserve the current Markdown and staged images before reopening; image previews otherwise belong to the current browser session. Attachments already uploaded stay on the page and can be reused.

Attachment access follows the parent item's SharePoint permissions. External image links remain content dependencies and may require network access; the application's own JavaScript, CSS, icons, and logo are bundled.

Global search loads accessible articles into the browser for immediate title/body/tag/author matching. The adapter follows pagination, but this remains a lightweight hub: very large collections may require server-side SharePoint search and a different loading strategy. Test your site's list-view thresholds, permissions, file limits, and hosting policies before broad rollout.

## Repository layout

```text
src/
  assets/               Shared MetSoft emblem, bundled into the HTML
  components/           Reader, visual editor, content renderer, dialogs
  data/                 Local demonstration content
  lib/                  Sanitized rich content and Markdown conversion
  services/             SharePoint/local adapters, image saves, list schema
  types.ts              Shared data contracts
scripts/
  provision-sharepoint.ps1
  verify-singlefile.mjs
.github/workflows/build-sharepoint-html.yml
docs/discovery.md
docs/confluence-design-review.md
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
| Create-space dialog opens but its button does nothing | Replace older HTML with the current release; earlier builds relied on native form submission, which sandboxed embeds can block. The current build does not require the iframe's `allow-forms` permission. |
| Local mode appears on SharePoint | Page context is absent; use the explicit same-origin `siteUrl` and reload |
| 401/403 or digest failure | Current session, same-origin host, site URL, and permissions; sign in again if needed |
| Lists or columns missing | A site owner with Manage Lists can run Workspace settings |
| Workspace settings is not shown | It is owner-only; local/demo mode, non-owner access, or an unsuccessful owner check keeps it hidden |
| A Metrology App User member can use Tracker but cannot read, create, or edit here | An owner must upload the current HTML, then run Workspace settings → Team access → Check team access → Repair team access → review Apply shared access. Tracker's scoped grants do not configure these app lists; refresh after repair. |
| Team access is ready but the app page cannot be opened | The repair does not grant access to the host page, HTML file, library, or site; check those permissions separately |
| Delete page is missing or blocked | Only the native original creator can delete through the app. All child pages must be moved or deleted first; SharePoint must also permit deletion. |
| Duplicate-list alias error | Resolve canonical/legacy duplicates; the app deliberately does not select one |
| Save conflict | Another edit changed the item; reload the latest article before editing again |
| Image save partly completed | Keep the editor open and follow its recovery message; reopen the latest page before retrying an uncertain save |
| Browser demo storage is full | Remove unnecessary local files or clear demo storage; production uses SharePoint |
| Release missing | Check the exact commit's workflow and repository release-write policy |
