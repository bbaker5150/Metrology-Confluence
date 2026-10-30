import type {
  Attachment,
  Comment,
  Page,
  PageInput,
  PageVersion,
  SetupCheck,
  Space,
} from "../types";
import { createSeed } from "../data/seed";
import { fieldXml, listSchema, type ListKey } from "./schema";

declare global {
  interface Window {
    _spPageContextInfo?: { webAbsoluteUrl?: string; userDisplayName?: string };
  }
}
const ACCEPT = "application/json;odata=nometadata";
const STORAGE_KEY = "metrology-confluence:demo:v1";
const listKeys = Object.keys(listSchema) as ListKey[];
const encodeLiteral = (text: string) =>
  encodeURIComponent(text.replace(/'/g, "''")).replace(/'/g, "%27");
const listPath = (title: string) =>
  `/_api/web/lists/getbytitle('${encodeLiteral(title)}')`;
const unwrap = <T>(body: unknown): T => ((body as { d?: T })?.d ?? body) as T;
const results = <T>(body: unknown): T[] => {
  const value = unwrap<{ value?: T[]; results?: T[] }>(body);
  const rows = value?.value ?? value?.results;
  if (!Array.isArray(rows))
    throw new Error("SharePoint returned an unexpected collection response.");
  return rows;
};
export class SharePointError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "",
  ) {
    super(message);
    this.name = "SharePointError";
  }
}
export interface ServiceContext {
  mode: "local" | "sharepoint";
  webUrl: string;
}
export function detectContext(win: Window): ServiceContext {
  if (["localhost", "127.0.0.1", "[::1]"].includes(win.location.hostname))
    return { mode: "local", webUrl: "" };
  let context = win._spPageContextInfo?.webAbsoluteUrl;
  try {
    context ||= win.parent?._spPageContextInfo?.webAbsoluteUrl;
  } catch {
    /* Cross-origin parent cannot provide context. */
  }
  const explicit = new URLSearchParams(win.location.search).get("siteUrl");
  const candidate = explicit || context;
  if (!candidate) return { mode: "local", webUrl: "" };
  let url: URL;
  try {
    url = new URL(candidate, win.location.href);
  } catch {
    throw new Error(
      "SharePoint siteUrl is not a valid URL. Open Admin / Setup to correct it.",
    );
  }
  if (
    url.origin !== win.location.origin ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "SharePoint siteUrl must be a same-origin site URL without query parameters or a fragment.",
    );
  return { mode: "sharepoint", webUrl: url.href.replace(/\/+$/, "") };
}
export class SharePointClient {
  private digest?: { value: string; expires: number };
  private digestPending?: Promise<string>;
  private names = new Map<ListKey, Promise<string>>();
  constructor(
    public webUrl: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  private url(path: string) {
    const url = new URL(
      path.startsWith("/_api/") ? `${this.webUrl}${path}` : path,
      `${this.webUrl}/`,
    );
    if (
      url.origin !== new URL(this.webUrl).origin ||
      !url.pathname.startsWith(
        `${new URL(this.webUrl).pathname.replace(/\/$/, "")}/_api/`,
      )
    )
      throw new Error(
        "Rejected a SharePoint response URL outside this site API.",
      );
    return url.href;
  }
  private async read(response: Response): Promise<unknown> {
    const text = await response.text();
    let body: {
      error?: { code?: string; message?: string | { value?: string } };
    } = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        if (response.ok)
          throw new Error(
            "SharePoint returned HTML or invalid JSON. Check the site URL and sign-in session.",
          );
      }
    }
    if (!response.ok) {
      const detail = body.error?.message;
      const message = typeof detail === "string" ? detail : detail?.value;
      const explanation =
        response.status === 412
          ? "This page changed since you opened it. Reload before saving to avoid overwriting another editor."
          : response.status === 403
            ? "SharePoint denied access. Check your list permissions and sign-in session."
            : response.status === 404
              ? "SharePoint list or item was not found. Check Admin / Setup."
              : `SharePoint request failed (${response.status}).`;
      throw new SharePointError(
        `${explanation}${message ? ` ${message}` : ""}`,
        response.status,
        body.error?.code,
      );
    }
    return body;
  }
  private async send(url: string, options: RequestInit): Promise<unknown> {
    try {
      return await this.read(
        // Native browser fetch requires the Window receiver, not this client instance.
        await this.fetcher.call(globalThis, url, {
          ...options,
          credentials: "include",
          signal: AbortSignal.timeout(45000),
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError")
        throw new Error(
          "SharePoint request timed out. A write may have completed; reload before retrying.",
        );
      throw error;
    }
  }
  async getDigest(): Promise<string> {
    if (this.digest && this.digest.expires > Date.now())
      return this.digest.value;
    if (!this.digestPending)
      this.digestPending = (async () => {
        const body = await this.send(`${this.webUrl}/_api/contextinfo`, {
          method: "POST",
          headers: { Accept: ACCEPT },
        });
        const raw = unwrap<{
          GetContextWebInformation?: {
            FormDigestValue: string;
            FormDigestTimeoutSeconds: number;
          };
          FormDigestValue?: string;
          FormDigestTimeoutSeconds?: number;
        }>(body);
        const data = raw.GetContextWebInformation ?? raw;
        if (!data.FormDigestValue)
          throw new Error("SharePoint returned no request digest.");
        this.digest = {
          value: data.FormDigestValue,
          expires:
            Date.now() +
            Math.max(0, Number(data.FormDigestTimeoutSeconds ?? 1800) - 60) *
              1000,
        };
        return this.digest.value;
      })().finally(() => {
        this.digestPending = undefined;
      });
    return this.digestPending;
  }
  get(path: string) {
    return this.send(this.url(path), {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json;odata=minimalmetadata" },
    });
  }
  async write(
    path: string,
    body?: unknown,
    method?: "MERGE" | "DELETE",
    etag = "*",
    raw = false,
    verbose = false,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: ACCEPT,
      "X-RequestDigest": await this.getDigest(),
    };
    if (method) {
      headers["X-HTTP-Method"] = method;
      headers["IF-MATCH"] = etag;
    }
    if (body !== undefined)
      headers["Content-Type"] = raw
        ? "application/octet-stream"
        : verbose
          ? "application/json;odata=verbose"
          : ACCEPT;
    return this.send(this.url(path), {
      method: "POST",
      headers,
      body:
        body === undefined
          ? undefined
          : raw
            ? (body as BodyInit)
            : JSON.stringify(body),
    });
  }
  async collection<T>(path: string): Promise<T[]> {
    const rows: T[] = [];
    const visited = new Set<string>();
    let next: string | undefined = path;
    while (next) {
      const absolute = this.url(next);
      if (visited.has(absolute))
        throw new Error("SharePoint returned a repeated pagination link.");
      visited.add(absolute);
      const body = await this.get(next);
      rows.push(...results<T>(body));
      const data = unwrap<{
        "odata.nextLink"?: string;
        "@odata.nextLink"?: string;
        __next?: string;
      }>(body);
      next = data["odata.nextLink"] ?? data["@odata.nextLink"] ?? data.__next;
    }
    return rows;
  }
  clearNames() {
    this.names.clear();
  }
  async resolve(key: ListKey): Promise<string> {
    if (!this.names.has(key)) {
      const pending = (async () => {
        const found: string[] = [];
        for (const title of [
          listSchema[key].title,
          ...listSchema[key].aliases,
        ]) {
          try {
            const row = unwrap<{ BaseTemplate: number; Title: string }>(
              await this.get(
                `${listPath(title)}?$select=Id,Title,BaseTemplate`,
              ),
            );
            if (row.BaseTemplate !== 100)
              throw new Error(`${title} is not a generic SharePoint list.`);
            found.push(title);
          } catch (error) {
            if (!(error instanceof SharePointError && error.status === 404))
              throw error;
          }
        }
        if (found.length > 1)
          throw new Error(
            `Duplicate list aliases found for ${listSchema[key].title}. Resolve the duplicate lists before continuing.`,
          );
        if (!found.length)
          throw new SharePointError(
            `${listSchema[key].title} has not been provisioned. Open Admin / Setup.`,
            404,
          );
        return listPath(found[0]);
      })();
      this.names.set(key, pending);
      pending.catch(() => {
        if (this.names.get(key) === pending) this.names.delete(key);
      });
    }
    return this.names.get(key)!;
  }
}
type LocalData = ReturnType<typeof createSeed>;
function localData(): LocalData {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved) as LocalData;
      if (
        !Array.isArray(data.pages) ||
        !Array.isArray(data.spaces) ||
        !Array.isArray(data.versions) ||
        !Array.isArray(data.comments) ||
        !data.attachments
      )
        throw new Error();
      return data;
    } catch {
      throw new Error(
        "Local demo data is unreadable. Export or clear this app’s local storage before continuing.",
      );
    }
  }
  const seed = createSeed();
  persist(seed);
  return seed;
}
function persist(data: LocalData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw new Error(
      "The browser could not save demo data. Storage may be full or disabled. No changes were saved.",
    );
  }
}
const nextId = (rows: { Id: number }[]) =>
  Math.max(0, ...rows.map((p) => p.Id)) + 1;
const parseTags = (tags: unknown): string[] => {
  if (Array.isArray(tags)) return tags.filter((t) => typeof t === "string");
  try {
    const parsed = JSON.parse(String(tags || "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((t) => typeof t === "string")
      : [];
  } catch {
    return [];
  }
};
function pageFrom(raw: unknown): Page {
  const item = raw as Page & {
    "odata.etag"?: string;
    "@odata.etag"?: string;
    __metadata?: { etag?: string };
  };
  return {
    ...item,
    ParentPageId: item.ParentPageId || null,
    Tags: parseTags(item.Tags),
    Content: item.Content || "",
    Summary: item.Summary || "",
    etag:
      item["odata.etag"] ??
      item["@odata.etag"] ??
      item.__metadata?.etag ??
      item.etag,
  };
}
function validatePage(page: PageInput) {
  if (!page.Title.trim() || page.Title.trim().length > 255)
    throw new Error("Enter a page title between 1 and 255 characters.");
  if (!Number.isSafeInteger(page.SpaceId) || page.SpaceId <= 0)
    throw new Error("Choose a valid space.");
  if (JSON.stringify(page.Tags ?? []).length > 255)
    throw new Error(
      "Tags must fit within 255 characters including JSON formatting.",
    );
  if (page.Id && page.ParentPageId === page.Id)
    throw new Error("A page cannot be its own parent.");
  if (page.Status && !["Draft", "Published", "Archived"].includes(page.Status))
    throw new Error("Invalid page status.");
}
export class KnowledgeService {
  public readonly mode: "local" | "sharepoint";
  private client?: SharePointClient;
  private userPromise?: Promise<string>;
  public readonly initializationError?: Error;
  constructor(context?: ServiceContext, fetcher: typeof fetch = fetch) {
    let resolved: ServiceContext;
    try {
      resolved = context ?? detectContext(window);
    } catch (error) {
      this.mode = "sharepoint";
      this.initializationError =
        error instanceof Error ? error : new Error(String(error));
      return;
    }
    this.mode = resolved.mode;
    if (resolved.mode === "sharepoint")
      this.client = new SharePointClient(resolved.webUrl, fetcher);
  }
  private assertInitialized() {
    if (this.initializationError) throw this.initializationError;
  }
  async currentUser(): Promise<string> {
    this.assertInitialized();
    if (!this.client) return Promise.resolve("Demo Editor");
    return (this.userPromise ||= this.client
      .get("/_api/web/currentuser?$select=Title")
      .then((body) => unwrap<{ Title: string }>(body).Title)
      .catch((error) => {
        this.userPromise = undefined;
        throw error;
      }));
  }
  private async sitePermissionBits(): Promise<bigint> {
    if (!this.client)
      throw new Error("SharePoint site permissions are unavailable.");
    const raw = unwrap<{
      Low?: string | number;
      EffectiveBasePermissions?: { Low?: string | number };
    }>(await this.client.get("/_api/web/EffectiveBasePermissions"));
    const low = (raw?.EffectiveBasePermissions ?? raw)?.Low;
    if (
      (typeof low !== "string" && typeof low !== "number") ||
      !/^\d+$/.test(String(low)) ||
      BigInt(low) > 4294967295n
    )
      throw new Error("SharePoint returned invalid site permissions.");
    return BigInt(low);
  }
  async canManageWorkspace(): Promise<boolean> {
    // Match the suite's owner definition using effective site permissions,
    // which include inherited and nested security-group grants. Never infer
    // ownership from a display name, Manage Lists alone, or local demo mode.
    if (this.initializationError || !this.client) return false;
    try {
      const user = unwrap<{ IsSiteAdmin?: boolean }>(
        await this.client.get("/_api/web/currentuser?$select=IsSiteAdmin"),
      );
      if (user?.IsSiteAdmin === true) return true;
      return ((await this.sitePermissionBits()) & 33554432n) !== 0n;
    } catch {
      return false;
    }
  }
  async getSpaces(): Promise<Space[]> {
    this.assertInitialized();
    const spaces = this.client
      ? await this.client.collection<Space>(
          `${await this.client.resolve("Spaces")}/items?$top=5000`,
        )
      : localData().spaces;
    return spaces
      .filter((s) => !s.IsArchived)
      .sort((a, b) => a.SortOrder - b.SortOrder);
  }
  async getPages(): Promise<Page[]> {
    this.assertInitialized();
    const pages = this.client
      ? (
          await this.client.collection<unknown>(
            `${await this.client.resolve("Pages")}/items?$top=5000`,
          )
        ).map(pageFrom)
      : localData().pages;
    return pages.sort((a, b) => b.Modified.localeCompare(a.Modified));
  }
  async getVersions(pageId: number): Promise<PageVersion[]> {
    this.assertInitialized();
    const versions = this.client
      ? await this.client.collection<PageVersion>(
          `${await this.client.resolve("Versions")}/items?$filter=PageId eq ${id(pageId)}&$top=5000`,
        )
      : localData().versions.filter((v) => v.PageId === pageId);
    return versions.sort((a, b) => b.VersionNumber - a.VersionNumber);
  }
  async getComments(pageId: number): Promise<Comment[]> {
    this.assertInitialized();
    const comments = this.client
      ? await this.client.collection<Comment>(
          `${await this.client.resolve("Comments")}/items?$filter=PageId eq ${id(pageId)}&$top=5000`,
        )
      : localData().comments.filter((c) => c.PageId === pageId);
    return comments.sort((a, b) => a.Created.localeCompare(b.Created));
  }
  async getAttachments(pageId: number): Promise<Attachment[]> {
    this.assertInitialized();
    const files = this.client
      ? await this.client.collection<Attachment>(
          `${await this.client.resolve("Pages")}/items(${id(pageId)})/AttachmentFiles`,
        )
      : (localData().attachments[String(pageId)] ?? []);
    return files.map((file) => ({
      ...file,
      ServerRelativeUrl: this.safeAttachmentUrl(file.ServerRelativeUrl),
    }));
  }
  private safeAttachmentUrl(url: string) {
    if (
      !this.client &&
      /^data:(image\/(png|jpeg|gif|webp)|application\/octet-stream|application\/pdf|text\/plain);base64,/i.test(
        url,
      )
    )
      return url;
    const parsed = new URL(url, window.location.origin);
    if (
      parsed.origin !== window.location.origin ||
      !["http:", "https:"].includes(parsed.protocol)
    )
      throw new Error("An attachment points outside this SharePoint site.");
    return parsed.href;
  }
  async savePage(input: PageInput, changeNote = ""): Promise<Page> {
    this.assertInitialized();
    validatePage(input);
    if (changeNote.length > 255)
      throw new Error("Change notes must be 255 characters or fewer.");
    const user = await this.currentUser();
    const now = new Date().toISOString();
    const all = await this.getPages();
    const existing = input.Id ? all.find((p) => p.Id === input.Id) : undefined;
    if (input.Id && !existing) throw new Error("The page no longer exists.");
    if (
      existing &&
      existing.SpaceId !== input.SpaceId &&
      all.some((p) => p.ParentPageId === existing.Id)
    )
      throw new Error(
        "Move or reparent child pages before moving their parent to another space.",
      );
    const parentId =
      input.ParentPageId !== undefined
        ? input.ParentPageId
        : (existing?.ParentPageId ?? null);
    if (parentId) {
      let parent = all.find((p) => p.Id === parentId);
      const visited = new Set<number>(input.Id ? [input.Id] : []);
      while (parent) {
        if (parent.SpaceId !== input.SpaceId || visited.has(parent.Id))
          throw new Error(
            "Parent pages must belong to the same space and cannot create a cycle.",
          );
        visited.add(parent.Id);
        const next = parent.ParentPageId;
        parent = next ? all.find((p) => p.Id === next) : undefined;
      }
      if (!all.some((p) => p.Id === parentId))
        throw new Error("The selected parent page does not exist.");
    }
    if (!(await this.getSpaces()).some((s) => s.Id === input.SpaceId))
      throw new Error("The selected space does not exist.");
    const page: Page = {
      Id: input.Id ?? 0,
      Title: input.Title.trim(),
      SpaceId: input.SpaceId,
      ParentPageId: parentId,
      Content: input.Content,
      Summary: input.Summary ?? existing?.Summary ?? "",
      Tags: input.Tags ?? existing?.Tags ?? [],
      Status: input.Status ?? existing?.Status ?? "Draft",
      IsPinned: input.IsPinned ?? existing?.IsPinned ?? false,
      TemplateType: input.TemplateType ?? existing?.TemplateType ?? "blank",
      VersionCount: (existing?.VersionCount ?? 0) + 1,
      AuthorName: existing?.AuthorName ?? user,
      LastEditorName: user,
      Modified: now,
      Created: existing?.Created ?? now,
    };
    const version = (pageId: number): Omit<PageVersion, "Id"> => ({
      PageId: pageId,
      VersionNumber: page.VersionCount,
      TitleSnapshot: page.Title,
      ContentSnapshot: page.Content,
      ChangeNote: changeNote || (existing ? "Updated page" : "Created page"),
      EditedBy: user,
      Created: now,
    });
    if (!this.client) {
      const data = localData();
      const current = data.pages.find((p) => p.Id === input.Id);
      if (current && input.etag && current.etag !== input.etag)
        throw new SharePointError(
          "This page changed since you opened it. Reload before saving.",
          412,
        );
      page.Id ||= nextId(data.pages);
      page.etag = `"${page.VersionCount}"`;
      data.pages = data.pages.filter((p) => p.Id !== page.Id).concat(page);
      data.versions.push({ ...version(page.Id), Id: nextId(data.versions) });
      persist(data);
      return page;
    }
    const path = await this.client.resolve("Pages");
    const {
      Id: _id,
      Created: _created,
      Modified: _modified,
      etag: _etag,
      ...fields
    } = page;
    const payload = { ...fields, Tags: JSON.stringify(page.Tags) };
    if (existing) {
      const etag = input.etag;
      if (!etag)
        throw new Error(
          "This page has no edit token. Reload it before saving.",
        );
      await this.client.write(
        `${path}/items(${id(existing.Id)})`,
        payload,
        "MERGE",
        etag,
      );
    } else {
      const created = unwrap<{ Id: number }>(
        await this.client.write(`${path}/items`, payload),
      );
      page.Id = created.Id;
    }
    try {
      const { Created: _date, ...snapshot } = version(page.Id);
      await this.client.write(
        `${await this.client.resolve("Versions")}/items`,
        { Title: `Page ${page.Id} · v${page.VersionCount}`, ...snapshot },
      );
    } catch (error) {
      throw new Error(
        `Page ${page.Id} was saved, but its revision snapshot could not be recorded. Reload before continuing; native SharePoint version history remains available. ${error instanceof Error ? error.message : ""}`,
      );
    }
    return pageFrom(
      unwrap(await this.client.get(`${path}/items(${id(page.Id)})`)),
    );
  }
  restoreVersion(page: Page, version: PageVersion) {
    this.assertInitialized();
    if (version.PageId !== page.Id)
      throw new Error("That revision belongs to another page.");
    return this.savePage(
      {
        ...page,
        Title: version.TitleSnapshot,
        Content: version.ContentSnapshot,
      },
      `Restored version ${version.VersionNumber}`,
    );
  }
  async addComment(pageId: number, body: string): Promise<Comment> {
    this.assertInitialized();
    if (!body.trim()) throw new Error("Write a comment first.");
    const comment = {
      PageId: id(pageId),
      CommentBody: body.trim(),
      AuthorName: await this.currentUser(),
    };
    if (this.client)
      return unwrap(
        await this.client.write(
          `${await this.client.resolve("Comments")}/items`,
          { Title: `Comment on page ${pageId}`, ...comment },
        ),
      );
    const data = localData();
    const created = {
      ...comment,
      Id: nextId(data.comments),
      Created: new Date().toISOString(),
    };
    data.comments.push(created);
    persist(data);
    return created;
  }
  async uploadAttachment(pageId: number, file: File): Promise<Attachment> {
    this.assertInitialized();
    id(pageId);
    if (
      !file.name ||
      file.name.length > 128 ||
      /[\\/:*?"<>|#%\x00-\x1f]/.test(file.name) ||
      /\.(html?|svg|js|mjs|exe|bat|cmd|ps1)$/i.test(file.name)
    )
      throw new Error(
        "Use a safe file name without reserved characters. Active HTML, SVG, scripts, and executables are not supported.",
      );
    const limit = this.client ? 10 : 2;
    if (file.size > limit * 1024 * 1024)
      throw new Error(
        `Attachments must be ${limit} MB or smaller in ${this.mode} mode.`,
      );
    if (this.client) {
      const raw = unwrap<Attachment>(
        await this.client.write(
          `${await this.client.resolve("Pages")}/items(${pageId})/AttachmentFiles/add(FileName='${encodeLiteral(file.name)}')`,
          await file.arrayBuffer(),
          undefined,
          "*",
          true,
        ),
      );
      return {
        ...raw,
        ServerRelativeUrl: this.safeAttachmentUrl(raw.ServerRelativeUrl),
        Size: file.size,
        MimeType: file.type,
      };
    }
    const data = localData();
    if (!data.pages.some((p) => p.Id === pageId))
      throw new Error("Save the page before attaching files.");
    const files = (data.attachments[String(pageId)] ||= []);
    if (files.some((f) => f.FileName === file.name))
      throw new Error("A file with that name is already attached.");
    const allowedType =
      /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(
        file.type,
      )
        ? file.type
        : "application/octet-stream";
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("Could not read the attachment."));
      reader.readAsDataURL(new Blob([file], { type: allowedType }));
    });
    const attachment = {
      FileName: file.name,
      ServerRelativeUrl: url,
      Size: file.size,
      MimeType: allowedType,
    };
    files.push(attachment);
    persist(data);
    return attachment;
  }
  async createSpace(title: string, description: string): Promise<Space> {
    this.assertInitialized();
    if (!title.trim() || title.length > 255)
      throw new Error("Enter a space name between 1 and 255 characters.");
    const spaces = await this.getSpaces();
    const fields = {
      Title: title.trim(),
      Slug: `${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}-${Date.now().toString(36)}`,
      Description: description,
      IconName: "BookOpen",
      AccentColor: "#207de9",
      SortOrder: spaces.length,
      IsArchived: false,
    };
    if (this.client)
      return unwrap(
        await this.client.write(
          `${await this.client.resolve("Spaces")}/items`,
          fields,
        ),
      );
    const data = localData();
    const space = { Id: nextId(data.spaces), ...fields };
    data.spaces.push(space);
    persist(data);
    return space;
  }
  async checkSetup(): Promise<SetupCheck[]> {
    this.assertInitialized();
    if (!this.client)
      return listKeys.map((key) => ({
        title: listSchema[key].title,
        exists: true,
        missingFields: [],
      }));
    this.client.clearNames();
    return Promise.all(
      listKeys.map(async (key) => {
        let path: string;
        try {
          path = await this.client!.resolve(key);
        } catch (error) {
          if (error instanceof SharePointError && error.status === 404)
            return {
              title: listSchema[key].title,
              exists: false,
              missingFields: listSchema[key].fields.map((f) => f.name),
            };
          throw error;
        }
        const fields = await this.client!.collection<{
          InternalName: string;
          TypeAsString: string;
        }>(`${path}/fields?$select=InternalName,TypeAsString&$top=5000`);
        const titleField = fields.find((f) => f.InternalName === "Title");
        if (!titleField || titleField.TypeAsString !== "Text")
          throw new Error(
            `${listSchema[key].title} is missing the native Text Title field. Ask a site owner to repair the list before setup.`,
          );
        for (const expected of listSchema[key].fields) {
          const actual = fields.find((f) => f.InternalName === expected.name);
          if (actual && actual.TypeAsString !== expected.type)
            throw new Error(
              `${listSchema[key].title}.${expected.name} must be ${expected.type}, but is ${actual.TypeAsString}. Ask a site owner to repair the schema.`,
            );
        }
        return {
          title: listSchema[key].title,
          exists: true,
          missingFields: listSchema[key].fields
            .filter(
              (f) => !fields.some((actual) => actual.InternalName === f.name),
            )
            .map((f) => f.name),
        };
      }),
    );
  }
  async provision(): Promise<void> {
    this.assertInitialized();
    // Reverify on every attempt so a previously visible settings dialog cannot
    // retain provisioning access after SharePoint ownership is revoked.
    if (!(await this.canManageWorkspace()) || !this.client)
      throw new Error("Only a verified SharePoint site owner can run setup.");
    if (((await this.sitePermissionBits()) & 2048n) === 0n)
      throw new Error(
        "A site owner with Manage Lists permission must run setup.",
      );
    const checks = await this.checkSetup(); // Resolve every alias before making schema changes.
    for (const key of listKeys) {
      const check = checks.find((c) => c.title === listSchema[key].title)!;
      if (!check.exists) {
        await this.client.write("/_api/web/lists", {
          Title: listSchema[key].title,
          BaseTemplate: 100,
          Description: `Metrology-Confluence ${key.toLowerCase()}`,
          Hidden: false,
          EnableAttachments: key === "Pages",
          EnableVersioning: key === "Pages",
          ContentTypesEnabled: false,
        });
        this.client.clearNames();
      }
      const path = await this.client.resolve(key);
      for (const name of check.missingFields) {
        const field = listSchema[key].fields.find((f) => f.name === name)!;
        await this.client.write(
          `${path}/fields/createfieldasxml`,
          {
            parameters: {
              __metadata: { type: "SP.XmlSchemaFieldCreationInformation" },
              SchemaXml: fieldXml(field),
              Options: 8,
            },
          },
          undefined,
          "*",
          false,
          true,
        );
      }
      if (key === "Pages")
        await this.client.write(
          path,
          { EnableAttachments: true, EnableVersioning: true },
          "MERGE",
        );
    }
    const verified = await this.checkSetup();
    if (verified.some((c) => !c.exists || c.missingFields.length))
      throw new Error(
        "Setup was incomplete. Rerun setup to finish creating the missing fields.",
      );
  }
}
function id(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("Invalid SharePoint item ID.");
  return value;
}
export const service = new KnowledgeService();
