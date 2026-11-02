import { useMemo, useState } from "react";
import { ArrowUpRight, FileText, Network } from "lucide-react";
import type { Page, Space } from "../types";
import { getPageConnections } from "../lib/pageLinks";

type Connection = "children" | "incoming" | "outgoing";
const labels: Record<Connection, string> = {
  children: "Child pages",
  incoming: "Links to this page",
  outgoing: "Links from this page",
};
export default function ConnectedPages({
  page,
  pages,
  spaces,
  onNavigate,
}: {
  page: Page;
  pages: Page[];
  spaces: Space[];
  onNavigate: (id: number) => void;
}) {
  const connections = useMemo(
    () => getPageConnections(page, pages),
    [page, pages],
  );
  const [tab, setTab] = useState<Connection>(() =>
    connections.children.length
      ? "children"
      : connections.incoming.length
        ? "incoming"
        : "outgoing",
  );
  const [expanded, setExpanded] = useState(false);
  if (
    !connections.children.length &&
    !connections.incoming.length &&
    !connections.outgoing.length
  )
    return null;
  const items = connections[tab];
  return (
    <section className="connected-pages" aria-label="Connected pages">
      <h2>
        <Network size={18} />
        Connected pages
      </h2>
      <div
        className="reader-tabs"
        role="tablist"
        aria-label="Page relationships"
      >
        {(Object.keys(labels) as Connection[]).map((key) => (
          <button
            type="button"
            role="tab"
            key={key}
            aria-selected={tab === key}
            aria-label={labels[key]}
            onClick={() => {
              setTab(key);
              setExpanded(false);
            }}
          >
            {labels[key]}
            <span className="count" aria-hidden="true">
              {connections[key].length}
            </span>
          </button>
        ))}
      </div>
      <div
        className="connected-pages-list"
        role="tabpanel"
        aria-label={labels[tab]}
      >
        {(expanded ? items : items.slice(0, 6)).map((item) => (
          <button
            type="button"
            key={item.Id}
            className="connected-page-link"
            onClick={() => onNavigate(item.Id)}
          >
            <FileText size={17} />
            <span>
              <strong>{item.Title}</strong>
              <small>
                {spaces.find((space) => space.Id === item.SpaceId)?.Title ||
                  "Space"}
                {item.Status === "Draft" ? " · Draft" : ""}
              </small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        ))}
        {!items.length && (
          <p className="empty-inline">
            {tab === "children"
              ? "No active child pages yet."
              : tab === "incoming"
                ? "No accessible active pages link here yet."
                : "No links to other active pages in this article yet."}
          </p>
        )}
      </div>
      {items.length > 6 && (
        <button
          type="button"
          className="text-button"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer pages" : `Show all ${items.length} pages`}
        </button>
      )}
    </section>
  );
}
