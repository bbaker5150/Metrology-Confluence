import type { Page } from "../types";
import { toEditorHTML } from "./content";

export interface PageConnections {
  children: Page[];
  incoming: Page[];
  outgoing: Page[];
}

function pageIdFromHref(href: string, base: URL): number | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  // The query is part of the application identity: siteUrl can select another
  // SharePoint web while leaving this host's origin and pathname unchanged.
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.origin !== base.origin ||
    url.pathname !== base.pathname ||
    url.search !== base.search
  )
    return null;
  const parameters = new URLSearchParams(url.hash.slice(1));
  const values = parameters.getAll("page");
  if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0])) return null;
  const id = Number(values[0]);
  return Number.isSafeInteger(id) ? id : null;
}

/** Only real, sanitized links count. Code examples and image URLs do not. */
export function extractPageLinkIds(
  content: string,
  baseUrl = window.location.href,
): number[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const template = document.createElement("template");
  template.innerHTML = toEditorHTML(content);
  const ids = new Set<number>();
  for (const anchor of template.content.querySelectorAll("a[href]")) {
    if (anchor.closest("pre,code")) continue;
    const id = pageIdFromHref(anchor.getAttribute("href") || "", base);
    if (id !== null) ids.add(id);
  }
  return [...ids];
}

function byTitle(a: Page, b: Page): number {
  return (
    a.Title.localeCompare(b.Title, undefined, { sensitivity: "base" }) ||
    a.Title.localeCompare(b.Title) ||
    a.Id - b.Id
  );
}

/**
 * `pages` must be the accessible collection already returned by SharePoint.
 * This helper never fetches a destination or infers access to missing records.
 */
export function getPageConnections(
  current: Page,
  pages: Page[],
  baseUrl = window.location.href,
): PageConnections {
  const result: PageConnections = { children: [], incoming: [], outgoing: [] };
  if (current.Status === "Archived") return result;
  const available = new Map(
    pages
      .filter((page) => page.Status !== "Archived")
      .map((page) => [page.Id, page]),
  );
  if (!available.has(current.Id)) return result;
  const linkedIds = new Set(extractPageLinkIds(current.Content, baseUrl));
  for (const page of available.values()) {
    if (page.Id === current.Id) continue;
    if (page.ParentPageId === current.Id) result.children.push(page);
    if (linkedIds.has(page.Id)) result.outgoing.push(page);
    if (extractPageLinkIds(page.Content, baseUrl).includes(current.Id))
      result.incoming.push(page);
  }
  result.children.sort(byTitle);
  result.incoming.sort(byTitle);
  result.outgoing.sort(byTitle);
  return result;
}
