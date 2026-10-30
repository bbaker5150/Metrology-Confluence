import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  FileText,
  Home,
  Pin,
  Clock3,
  FileEdit,
  Settings,
  Moon,
  Sun,
  ArrowUpRight,
  Layers3,
  Menu,
  X,
  FolderOpen,
  Command,
  CheckCircle2,
} from "lucide-react";
import { service } from "./services/sharepointService";
import type { Space, Page } from "./types";
import Modal from "./components/Modal";
import Editor from "./components/Editor";
import ArticleReader from "./components/ArticleReader";

type View = "home" | "space" | "pinned" | "recent" | "drafts" | "tag";
const relative = (date: string) => {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
};
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  return at < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

export default function App() {
  const [spaces, setSpaces] = useState<Space[]>([]),
    [pages, setPages] = useState<Page[]>([]),
    [user, setUser] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [view, setView] = useState<View>("home"),
    [spaceId, setSpaceId] = useState<number>(),
    [pageId, setPageId] = useState<number>(
      () =>
        Number(new URLSearchParams(location.hash.slice(1)).get("page")) || 0,
    ),
    [tag, setTag] = useState("");
  const [editor, setEditor] = useState<Partial<Page> | null>(null),
    [search, setSearch] = useState(false),
    [admin, setAdmin] = useState(false),
    [newSpace, setNewSpace] = useState(false),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState("");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("mc-theme") || "light",
  );
  const notify = useCallback((message: string) => setToast(message), []);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, p, u] = await Promise.all([
        service.getSpaces(),
        service.getPages(),
        service.currentUser(),
      ]);
      setSpaces(s.filter((x) => !x.IsArchived));
      setPages(p);
      setUser(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("mc-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!editor) setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editor]);
  useEffect(() => {
    const h = () =>
      setPageId(
        Number(new URLSearchParams(location.hash.slice(1)).get("page")) || 0,
      );
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const navigate = (id: number) => {
    setPageId(id);
    location.hash = `page=${id}`;
    setSearch(false);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  const go = (next: View, id?: number) => {
    setView(next);
    setSpaceId(id);
    setPageId(0);
    history.replaceState(null, "", location.pathname + location.search);
    setMobile(false);
  };
  const create = (parent?: Page) => {
    if (!spaces.length) {
      setNewSpace(true);
      return;
    }
    setEditor({
      SpaceId: parent?.SpaceId || spaceId || spaces[0]?.Id,
      ParentPageId: parent?.Id || null,
      Title: "",
      Content: "",
      Tags: [],
      Status: "Draft",
    });
  };
  const changed = (p: Page) =>
    setPages((previous) =>
      previous.some((x) => x.Id === p.Id)
        ? previous.map((x) => (x.Id === p.Id ? p : x))
        : [p, ...previous],
    );
  const page = pages.find((p) => p.Id === pageId),
    space = spaces.find((s) => s.Id === spaceId);
  const live = pages.filter((p) => p.Status !== "Archived");
  const tags = Array.from(new Set(live.flatMap((p) => p.Tags))).sort();
  const visible = live
    .filter((p) =>
      view === "space"
        ? p.SpaceId === spaceId
        : view === "pinned"
          ? p.IsPinned
          : view === "drafts"
            ? p.Status === "Draft" && p.AuthorName === user
            : view === "tag"
              ? p.Tags.includes(tag)
              : true,
    )
    .sort((a, b) => b.Modified.localeCompare(a.Modified));
  const navItems = [
    { key: "home" as View, label: "All spaces", icon: Home },
    { key: "pinned" as View, label: "Pinned pages", icon: Pin },
    { key: "recent" as View, label: "Recently updated", icon: Clock3 },
    { key: "drafts" as View, label: "My drafts", icon: FileEdit },
  ];
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside
        className={`sidebar ${mobile ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          <span>
            METROLOGY
            <strong>
              Confluence<span className="brand-dot">.</span>
            </strong>
          </span>
        </a>
        <div className="sidebar-caption">TEAM KNOWLEDGE</div>
        <nav>
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              key={key}
              className={`nav-item ${view === key && !pageId ? "active" : ""}`}
              onClick={() => go(key)}
            >
              <Icon size={17} />
              {label}
              {key === "drafts" && (
                <span className="nav-count">
                  {
                    live.filter(
                      (p) => p.Status === "Draft" && p.AuthorName === user,
                    ).length
                  }
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-caption caption-with-action">
          SPACES
          <button
            type="button"
            aria-label="Create space"
            onClick={() => setNewSpace(true)}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="space-navigation">
          {spaces.map((s) => (
            <div key={s.Id}>
              <button
                type="button"
                className={`nav-item ${spaceId === s.Id && view === "space" && !pageId ? "active" : ""}`}
                onClick={() => go("space", s.Id)}
              >
                <span
                  className="space-dot"
                  style={{ background: s.AccentColor }}
                />
                {s.Title}
                <ChevronRight size={13} className="push-right" />
              </button>
              {(spaceId === s.Id || page?.SpaceId === s.Id) && (
                <PageTree
                  pages={live.filter((p) => p.SpaceId === s.Id)}
                  selected={pageId}
                  onNavigate={navigate}
                  onCreate={create}
                />
              )}
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="suite-label">
            <Layers3 size={17} />
            <span>
              Metrology software suite<small>One place for what we know.</small>
            </span>
          </div>
          <button
            type="button"
            className="nav-item"
            onClick={() => setAdmin(true)}
          >
            <Settings size={17} />
            Admin / Setup
          </button>
          <div className="profile">
            <span className="avatar">
              {(user || "Local User")
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </span>
            <div>
              {user || "Knowledge hub"}
              <small>
                {service.mode === "local"
                  ? "Local demo workspace"
                  : "SharePoint workspace"}
              </small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={21} />
          </button>
          <div className="topbar-title">
            <BookOpen size={16} />
            <span>Knowledge hub</span>
            <ChevronRight size={14} />
            <strong>
              {page
                ? "Article"
                : space && view === "space"
                  ? space.Title
                  : "Overview"}
            </strong>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="search-trigger"
              onClick={() => setSearch(true)}
            >
              <Search size={16} />
              <span>Search knowledge…</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => create()}
              disabled={loading}
            >
              <Plus size={16} />
              Create page
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {service.mode === "local" && (
            <div className="mode-banner">
              <span className="demo-dot" />
              Local demo · Changes are saved in this browser.
              <button type="button" onClick={() => setAdmin(true)}>
                Connect to SharePoint <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {error ? (
            <div className="error-panel" role="alert">
              <h2>Couldn’t load this workspace</h2>
              <p>{error}</p>
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  onClick={() => void refresh()}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => setAdmin(true)}
                >
                  Open setup
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="empty-state">
              <BookOpen className="loading-icon" />
              <h2>Opening your knowledge hub…</h2>
            </div>
          ) : page ? (
            <ArticleReader
              key={page.Id}
              page={page}
              pages={pages}
              spaces={spaces}
              onNavigate={navigate}
              onEdit={() => setEditor(page)}
              onChanged={changed}
              onToast={notify}
            />
          ) : pageId ? (
            <div className="empty-state">
              <h2>Page not found</h2>
              <p>This page may have moved or you may not have access.</p>
              <button
                type="button"
                className="button"
                onClick={() => go("home")}
              >
                Back to all spaces
              </button>
            </div>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    {view === "home"
                      ? "THE SHARED SOURCE OF KNOWLEDGE"
                      : view === "space"
                        ? "WORKSPACE"
                        : "YOUR KNOWLEDGE LIBRARY"}
                  </div>
                  <h1>
                    {view === "home"
                      ? "Good work starts with shared knowledge."
                      : view === "space"
                        ? space?.Title
                        : view === "pinned"
                          ? "Pinned pages"
                          : view === "recent"
                            ? "Recently updated"
                            : view === "drafts"
                              ? "My drafts"
                              : `Topic: ${tag}`}
                  </h1>
                  <p>
                    {view === "home"
                      ? "Find an answer. Document a process. Move the whole team forward."
                      : view === "space"
                        ? space?.Description
                        : "Keep the information you need close at hand."}
                  </p>
                </div>
                {view !== "home" && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => create()}
                  >
                    <Plus size={16} />
                    New page
                  </button>
                )}
              </section>
              {view === "home" && (
                <>
                  <div className="stats-row">
                    <div>
                      <span className="stat-icon blue">
                        <FileText size={19} />
                      </span>
                      <strong>
                        {live.length}
                        <small>Knowledge pages</small>
                      </strong>
                    </div>
                    <div>
                      <span className="stat-icon mint">
                        <FolderOpen size={19} />
                      </span>
                      <strong>
                        {spaces.length}
                        <small>Connected spaces</small>
                      </strong>
                    </div>
                    <div>
                      <span className="stat-icon amber">
                        <Pin size={19} />
                      </span>
                      <strong>
                        {live.filter((p) => p.IsPinned).length}
                        <small>Pinned essentials</small>
                      </strong>
                    </div>
                    <div>
                      <span className="stat-icon violet">
                        <CheckCircle2 size={19} />
                      </span>
                      <strong>
                        {live.filter((p) => p.Status === "Published").length}
                        <small>Published articles</small>
                      </strong>
                    </div>
                  </div>
                  <section>
                    <SectionHeading
                      eyebrow="START HERE"
                      title="Pinned & essential"
                      action="View all pinned"
                      onClick={() => go("pinned")}
                    />
                    <div className="featured-grid">
                      {live
                        .filter((p) => p.IsPinned)
                        .slice(0, 3)
                        .map((p, i) => (
                          <button
                            type="button"
                            className={`featured-card feature-${i}`}
                            key={p.Id}
                            onClick={() => navigate(p.Id)}
                          >
                            <div className="card-kicker">
                              <span>
                                <Pin size={13} />
                                PINNED RESOURCE
                              </span>
                              <ArrowUpRight size={18} />
                            </div>
                            <div className="featured-icon">
                              <BookOpen size={24} />
                            </div>
                            <h3>{p.Title}</h3>
                            <p>{p.Summary}</p>
                            <div className="card-footer">
                              <span>
                                {spaces.find((s) => s.Id === p.SpaceId)?.Title}
                              </span>
                              <ChevronRight size={16} />
                            </div>
                          </button>
                        ))}
                      {!live.some((p) => p.IsPinned) && (
                        <div className="empty-card">
                          Pin useful articles to feature them here.
                        </div>
                      )}
                    </div>
                  </section>
                  <section>
                    <SectionHeading
                      eyebrow="EXPLORE TOGETHER"
                      title="Your spaces"
                      action="New space"
                      onClick={() => setNewSpace(true)}
                    />
                    <div className="space-grid">
                      {spaces.map((s) => (
                        <button
                          type="button"
                          className="space-card"
                          key={s.Id}
                          onClick={() => go("space", s.Id)}
                        >
                          <span
                            className="space-symbol"
                            style={{ color: s.AccentColor }}
                          >
                            <FolderOpen size={22} />
                          </span>
                          <ArrowUpRight className="space-arrow" size={17} />
                          <h3>{s.Title}</h3>
                          <p>{s.Description}</p>
                          <div className="space-meta">
                            <span>
                              {live.filter((p) => p.SpaceId === s.Id).length}{" "}
                              pages
                            </span>
                            <span>
                              {live
                                .filter((p) => p.SpaceId === s.Id)
                                .sort((a, b) =>
                                  b.Modified.localeCompare(a.Modified),
                                )[0]?.Modified
                                ? `Updated ${relative(live.filter((p) => p.SpaceId === s.Id).sort((a, b) => b.Modified.localeCompare(a.Modified))[0].Modified).toLowerCase()}`
                                : "Ready for your first page"}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}
              <div className="discovery-grid">
                <section className="recent-panel">
                  <SectionHeading
                    eyebrow={
                      view === "home"
                        ? "STAY IN THE LOOP"
                        : "BROWSE THE LIBRARY"
                    }
                    title={view === "home" ? "Recently updated" : "Pages"}
                    action={view === "home" ? "View all activity" : undefined}
                    onClick={() => go("recent")}
                  />
                  <div className="page-list">
                    {visible
                      .slice(0, view === "home" ? 6 : undefined)
                      .map((p) => (
                        <button
                          type="button"
                          key={p.Id}
                          className="page-row"
                          onClick={() => navigate(p.Id)}
                        >
                          <span className="document-icon">
                            <FileText size={19} />
                          </span>
                          <div className="page-row-main">
                            <strong>{p.Title}</strong>
                            <span>
                              {spaces.find((s) => s.Id === p.SpaceId)?.Title}
                              <i>·</i>
                              {p.LastEditorName}
                            </span>
                          </div>
                          <span className={`badge ${p.Status.toLowerCase()}`}>
                            {p.Status}
                          </span>
                          <time>{relative(p.Modified)}</time>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                    {!visible.length && (
                      <div className="empty-state">
                        <FileText size={26} />
                        <h3>No pages here yet</h3>
                        <p>Create a page to start sharing knowledge.</p>
                        <button
                          type="button"
                          className="button primary"
                          onClick={() => create()}
                        >
                          Create page
                        </button>
                      </div>
                    )}
                  </div>
                </section>
                <aside className="topics-panel">
                  <div className="eyebrow">FIND YOUR TOPIC</div>
                  <h2>Browse by tag</h2>
                  <p>A shorter path to the right answer.</p>
                  <div className="tag-cloud">
                    {tags.map((t) => (
                      <button
                        type="button"
                        className={`tag ${tag === t && view === "tag" ? "selected" : ""}`}
                        key={t}
                        onClick={() => {
                          setTag(t);
                          go("tag");
                        }}
                      >
                        #{t}
                        <span>
                          {live.filter((p) => p.Tags.includes(t)).length}
                        </span>
                      </button>
                    ))}
                    {!tags.length && <p>Add tags to your first article.</p>}
                  </div>
                  <div className="knowledge-tip">
                    <span className="tip-icon">✦</span>
                    <h3>Make the next question easier.</h3>
                    <p>Turn a solved problem into a page your team can find.</p>
                    <button type="button" onClick={() => create()}>
                      Share what you know <ArrowUpRight size={15} />
                    </button>
                  </div>
                </aside>
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>METROLOGY CONFLUENCE</span>
          <span>Built for clarity. Shared for progress.</span>
        </footer>
      </div>
      {search && (
        <SearchDialog
          pages={pages}
          spaces={spaces}
          onClose={() => setSearch(false)}
          onNavigate={navigate}
        />
      )}
      {editor && (
        <Editor
          page={editor}
          spaces={spaces}
          pages={pages}
          onCancel={() => setEditor(null)}
          onSave={async (p, note) => {
            const saved = await service.savePage(p, note);
            changed(saved);
            setEditor(null);
            navigate(saved.Id);
            notify(
              saved.Status === "Published" ? "Page published." : "Draft saved.",
            );
          }}
        />
      )}
      {admin && (
        <SetupDialog
          onClose={() => setAdmin(false)}
          onReady={async () => {
            await refresh();
            notify("Workspace setup is ready.");
          }}
        />
      )}
      {newSpace && (
        <CreateSpace
          onClose={() => setNewSpace(false)}
          onCreate={async (title, description) => {
            const s = await service.createSpace(title, description);
            setSpaces((v) => [...v, s]);
            setNewSpace(false);
            go("space", s.Id);
            notify("Space created.");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            type="button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function SectionHeading({
  eyebrow,
  title,
  action,
  onClick,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onClick: () => void;
}) {
  return (
    <div className="section-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      {action && (
        <button type="button" className="text-button" onClick={onClick}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
function PageTree({
  pages,
  selected,
  onNavigate,
  onCreate,
}: {
  pages: Page[];
  selected: number;
  onNavigate: (id: number) => void;
  onCreate: (p: Page) => void;
}) {
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const render = (parent: number | null, visited: number[] = []) =>
    pages
      .filter(
        (p) => (p.ParentPageId || null) === parent && !visited.includes(p.Id),
      )
      .map((p) => (
        <div className="tree-branch" key={p.Id}>
          <div className={`tree-row ${selected === p.Id ? "selected" : ""}`}>
            <button
              type="button"
              className="tree-toggle"
              aria-label={`${collapsed.includes(p.Id) ? "Expand" : "Collapse"} ${p.Title}`}
              onClick={() =>
                setCollapsed((v) =>
                  v.includes(p.Id) ? v.filter((x) => x !== p.Id) : [...v, p.Id],
                )
              }
            >
              {pages.some((x) => x.ParentPageId === p.Id) ? (
                collapsed.includes(p.Id) ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )
              ) : (
                <FileText size={12} />
              )}
            </button>
            <button
              type="button"
              className="tree-title"
              onClick={() => onNavigate(p.Id)}
            >
              {p.Title}
            </button>
            <button
              type="button"
              className="tree-add"
              aria-label={`Create child page under ${p.Title}`}
              onClick={() => onCreate(p)}
            >
              <Plus size={13} />
            </button>
          </div>
          {!collapsed.includes(p.Id) && (
            <div className="tree-children">
              {render(p.Id, [...visited, p.Id])}
            </div>
          )}
        </div>
      ));
  return <div className="page-tree">{render(null)}</div>;
}
function SearchDialog({
  pages,
  spaces,
  onClose,
  onNavigate,
}: {
  pages: Page[];
  spaces: Space[];
  onClose: () => void;
  onNavigate: (id: number) => void;
}) {
  const [q, setQ] = useState(""),
    [space, setSpace] = useState(""),
    [status, setStatus] = useState(""),
    [tag, setTag] = useState(""),
    [after, setAfter] = useState(""),
    [selected, setSelected] = useState(0);
  const results = useMemo(
    () =>
      pages
        .filter(
          (p) =>
            (!space || p.SpaceId === +space) &&
            (!status || p.Status === status) &&
            (!tag || p.Tags.includes(tag)) &&
            (!after || p.Modified.slice(0, 10) >= after) &&
            `${p.Title} ${p.Summary} ${p.Content} ${p.Tags.join(" ")} ${p.AuthorName} ${p.LastEditorName}`
              .toLowerCase()
              .includes(q.toLowerCase()),
        )
        .sort((a, b) => b.Modified.localeCompare(a.Modified)),
    [pages, q, space, status, tag, after],
  );
  useEffect(() => setSelected(0), [q, space, status, tag, after]);
  useEffect(() => {
    document
      .getElementById(`search-result-${selected}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <Modal title="Search knowledge" onClose={onClose} wide>
      <div
        className="command-search"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected((n) => Math.min(n + 1, results.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected((n) => Math.max(0, n - 1));
          }
          if (
            e.key === "Enter" &&
            results[selected] &&
            e.target instanceof HTMLInputElement &&
            e.target.type === "search"
          ) {
            e.preventDefault();
            onNavigate(results[selected].Id);
          }
        }}
      >
        <div className="search-input-wrap">
          <Search size={22} />
          <input
            autoFocus
            type="search"
            aria-label="Search all articles"
            placeholder="Search titles, content, tags, people…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-controls="search-results"
            aria-activedescendant={
              results[selected] ? `search-result-${selected}` : undefined
            }
          />
        </div>
        <div className="search-filters">
          <label>
            Space
            <select value={space} onChange={(e) => setSpace(e.target.value)}>
              <option value="">All spaces</option>
              {spaces.map((s) => (
                <option key={s.Id} value={s.Id}>
                  {s.Title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {["Published", "Draft", "Archived"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Tag
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All tags</option>
              {Array.from(new Set(pages.flatMap((p) => p.Tags)))
                .sort()
                .map((t) => (
                  <option key={t}>{t}</option>
                ))}
            </select>
          </label>
          <label>
            Updated since
            <input
              type="date"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
            />
          </label>
        </div>
        <div className="search-results" id="search-results">
          {results.map((p, i) => {
            const body = `${p.Summary || ""} ${p.Content}`.replace(
              /[#*`>]/g,
              "",
            );
            const at = body.toLowerCase().indexOf(q.toLowerCase());
            const snippet = body.slice(
              Math.max(0, at - 45),
              Math.max(0, at - 45) + 200,
            );
            return (
              <button
                type="button"
                id={`search-result-${i}`}
                key={p.Id}
                className={`search-result ${selected === i ? "selected" : ""}`}
                onClick={() => onNavigate(p.Id)}
                onFocus={() => setSelected(i)}
              >
                <FileText size={20} />
                <div>
                  <strong>
                    <Highlight text={p.Title} query={q} />
                  </strong>
                  <p>
                    <Highlight text={snippet} query={q} />
                  </p>
                  <small>
                    {spaces.find((s) => s.Id === p.SpaceId)?.Title} ·{" "}
                    {p.AuthorName} · {p.Status}
                  </small>
                </div>
                <ArrowUpRight size={16} />
              </button>
            );
          })}
          {!results.length && (
            <div className="empty-state">
              No articles match. Try a different query or filter.
            </div>
          )}
        </div>
        <div className="search-help">
          <span>{results.length} results</span>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate <kbd>↵</kbd> open <kbd>esc</kbd>{" "}
            close
          </span>
        </div>
      </div>
    </Modal>
  );
}
function SetupDialog({
  onClose,
  onReady,
}: {
  onClose: () => void;
  onReady: () => Promise<void>;
}) {
  const [checks, setChecks] = useState<
      { title: string; exists: boolean; missingFields: string[] }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [site, setSite] = useState("");
  const check = async () => {
    setBusy(true);
    setError("");
    try {
      setChecks(await service.checkSetup());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void check();
  }, []);
  return (
    <Modal title="Admin / Setup" onClose={onClose}>
      <p>
        Four SharePoint lists store your spaces, pages, revision history, and
        discussions. Setup is repeatable and adds only missing lists and
        columns.
      </p>
      <div className="notice">
        {service.mode === "local"
          ? "You’re in local demo mode. Setup below checks the browser adapter; it does not create SharePoint lists."
          : "SharePoint enforces your site permissions. List setup requires site-level Manage Lists permission."}
      </div>
      {checks.map((c) => (
        <div className="setup-row" key={c.title}>
          <div>
            <strong>{c.title}</strong>
            <small>
              {c.missingFields.length
                ? `Missing fields: ${c.missingFields.join(", ")}`
                : c.exists
                  ? "All required fields are available"
                  : "List not found"}
            </small>
          </div>
          <span
            className={`badge ${c.exists && !c.missingFields.length ? "published" : "draft"}`}
          >
            {c.exists && !c.missingFields.length ? "Ready" : "Setup needed"}
          </span>
        </div>
      ))}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void check()}
        >
          Check again
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || service.mode === "local"}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await service.provision();
              await check();
              await onReady();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Checking…" : "Create missing lists & fields"}
        </button>
      </div>
      <hr />
      <h3>Standalone SharePoint hosting</h3>
      <p>
        If the HTML host does not expose SharePoint context, provide the
        same-origin site URL explicitly. The app uses your existing SharePoint
        sign-in.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            const url = new URL(site);
            if (url.origin !== location.origin)
              throw new Error(
                "Open this HTML on the SharePoint origin first. Cross-origin connections are not supported.",
              );
            const current = new URL(location.href);
            current.searchParams.set("siteUrl", url.href);
            location.assign(current.href);
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        <label>
          SharePoint site URL
          <input
            type="url"
            required
            placeholder="https://tenant.sharepoint.com/sites/Metrology"
            value={site}
            onChange={(e) => setSite(e.target.value)}
          />
        </label>
        <button className="button" type="submit">
          Use this site
        </button>
      </form>
    </Modal>
  );
}
function CreateSpace({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, description: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Create a space"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!title.trim()) return;
          setBusy(true);
          setError("");
          try {
            await onCreate(title.trim(), description.trim());
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Space name
          <input
            autoFocus
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Metrology & Lab Ops"
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will your team share here?"
          />
        </label>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={busy || !title.trim()}
          >
            {busy ? "Creating…" : "Create space"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
