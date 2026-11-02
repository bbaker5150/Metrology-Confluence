type NavigationHost = {
  location: Pick<Location, "href">;
  history: Pick<History, "pushState" | "replaceState">;
};

/**
 * Update only the fragment of the actual document URL. A SharePoint preview can
 * run at blob:https://…/id, whose pathname is itself an HTTPS URL. Rebuilding
 * that address from pathname drops the blob scheme and violates History's
 * same-document rules. Sandboxed hosts can also forbid History altogether;
 * React's navigation state must still work without failing a completed write.
 */
export function updateRouteHash(
  hash: string,
  mode: "push" | "replace",
  host: NavigationHost = window,
): boolean {
  try {
    const url = new URL(host.location.href);
    url.hash = hash;
    if (mode === "push") host.history.pushState(null, "", url.href);
    else host.history.replaceState(null, "", url.href);
    return true;
  } catch {
    // URL synchronization is best-effort; never retry a data mutation because
    // its subsequent address-bar update was rejected by the host browser.
    return false;
  }
}
