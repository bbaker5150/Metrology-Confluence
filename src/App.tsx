import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Menu,
  X,
  FolderOpen,
  CheckCircle2,
  ArrowRight,
  Bookmark,
  Archive,
} from "lucide-react";
import { service } from "./services/sharepointService";
import { savePageWithImages } from "./services/imageSave";
import { contentText } from "./lib/content";
import type { Space, Page } from "./types";
import emblem from "./assets/metsoft-emblem.webp";
import Modal from "./components/Modal";
import Editor from "./components/Editor";
import ArticleReader from "./components/ArticleReader";
import GroupAccessPanel from "./components/GroupAccessPanel";
import { useSavedPages } from "./hooks/useSavedPages";

type View =
  | "home"
  | "space"
  | "pinned"
  | "recent"
  | "drafts"
  | "tag"
  | "saved"
  | "archived";
const relative = (date: string) => {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000),
  );
  return days === 0
    ? "Today"
    : days === 1
      ? "Yesterday"
      : days < 30
        ? `${days} days ago`
        : new Date(date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
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
  const savedPages = useSavedPages();
  const [libraryQuery, setLibraryQuery] = useState("");
  const [librarySort, setLibrarySort] = useState("updated");
  const [spaces, setSpaces] = useState<Space[]>([]),
    [pages, setPages] = useState<Page[]>([]),
    [user, setUser] = useState(""),
    [canManageWorkspace, setCanManageWorkspace] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [view, setView] = useState<View>("home"),
    [spaceId, setSpaceId] = useState<number>(),
    [pageId, setPageId] = useState(
      () =>
        Number(new URLSearchParams(location.hash.slice(1)).get("page")) || 0,
    ),
    [tag, setTag] = useState("");
  const [editor, setEditor] = useState<Partial<Page> | null>(null),
    [search, setSearch] = useState(false),
    [admin, setAdmin] = useState(false),
    [newSpace, setNewSpace] = useState(false),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState(""),
    [expandedSpaces, setExpandedSpaces] = useState<number[]>([]),
    [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const editorState = useRef({ dirty: false, busy: false });
  const readerBusy = useRef(false);
  const reportReaderBusy = useCallback((busy: boolean) => {
    readerBusy.current = busy;
  }, []);
  const discardEditorRecovery = useRef<(() => Promise<void>) | null>(null);
  const editorOpen = useRef(false);
  editorOpen.current = Boolean(editor);
  const currentHash = useRef(location.hash);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const reportEditorState = useCallback(
    (state: { dirty: boolean; busy: boolean }) => {
      editorState.current = state;
    },
    [],
  );
  const registerDiscardRecovery = useCallback(
    (clear: (() => Promise<void>) | null) => {
      discardEditorRecovery.current = clear;
    },
    [],
  );
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("mc-theme") || "light";
    } catch {
      return "light";
    }
  });
  const notify = useCallback((message: string) => setToast(message), []);
  const toggleSaved = async (id: number) => {
    try {
      const saved = await savedPages.toggle(id);
      notify(
        saved
          ? "Saved for later in this browser."
          : "Removed from your saved pages.",
      );
    } catch (failure) {
      notify(
        failure instanceof Error
          ? failure.message
          : "Your saved pages could not be updated.",
      );
    }
  };
  const finishEditing = useCallback(() => {
    editorState.current = { dirty: false, busy: false };
    editorOpen.current = false;
    setEditor(null);
  }, []);
  const transition = useCallback(
    (action: () => void) => {
      setCreateOpen(false);
      setSearch(false);
      setMobile(false);
      if (readerBusy.current) {
        notify("Please wait for the page operation to finish before leaving.");
        return;
      }
      if (editorOpen.current && editorState.current.busy) {
        notify("Your page is still saving. Please wait before leaving.");
        return;
      }
      if (editorOpen.current && editorState.current.dirty) {
        pendingNavigation.current = action;
        setDiscardOpen(true);
        return;
      }
      finishEditing();
      action();
    },
    [finishEditing, notify],
  );
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
    let active = true;
    void service
      .canManageWorkspace()
      .then((allowed) => {
        if (active) setCanManageWorkspace(allowed);
      })
      .catch(() => {
        if (active) setCanManageWorkspace(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("mc-theme", theme);
    } catch {
      /* Theme remains usable if browser storage is blocked. */
    }
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!admin && !newSpace && !discardOpen && !readerBusy.current)
          setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [admin, newSpace, discardOpen]);
  useEffect(() => {
    const h = () => {
      const nextHash = location.hash;
      if (nextHash === currentHash.current) return;
      if (editorOpen.current || readerBusy.current) {
        history.replaceState(
          null,
          "",
          location.pathname + location.search + currentHash.current,
        );
      }
      transition(() => {
        currentHash.current = nextHash;
        history.replaceState(
          null,
          "",
          location.pathname + location.search + nextHash,
        );
        setPageId(
          Number(new URLSearchParams(nextHash.slice(1)).get("page")) || 0,
        );
        window.scrollTo({ top: 0 });
      });
    };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, [transition]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!readerBusy.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  useEffect(() => {
    if (!createOpen) return;
    const h = (e: PointerEvent) => {
      if (!createRef.current?.contains(e.target as Node)) setCreateOpen(false);
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [createOpen]);
  const navigateNow = (id: number) => {
    setPageId(id);
    const nextHash = `#page=${id}`;
    currentHash.current = nextHash;
    history.pushState(null, "", location.pathname + location.search + nextHash);
    setSearch(false);
    setMobile(false);
    window.scrollTo({ top: 0 });
  };
  const navigate = (id: number) => transition(() => navigateNow(id));
  const go = (next: View, id?: number) =>
    transition(() => {
      setLibraryQuery("");
      setView(next);
      setSpaceId(id);
      setPageId(0);
      currentHash.current = "";
      history.replaceState(null, "", location.pathname + location.search);
      window.scrollTo({ top: 0 });
    });
  const startEditor = (next: Partial<Page>) => {
    setEditorSession((value) => value + 1);
    setEditor(next);
    setMobile(false);
    window.scrollTo({ top: 0 });
  };
  const create = (parent?: Page) =>
    transition(() => {
      if (!spaces.length) {
        setNewSpace(true);
        return;
      }
      startEditor({
        SpaceId: parent?.SpaceId || spaceId || spaces[0]?.Id,
        ParentPageId: parent?.Id || null,
        Title: "",
        Content: "",
        Tags: [],
        Status: "Draft",
      });
    });
  const changed = (p: Page) =>
    setPages((v) =>
      v.some((x) => x.Id === p.Id)
        ? v.map((x) => (x.Id === p.Id ? p : x))
        : [p, ...v],
    );
  const page = pages.find((p) => p.Id === pageId),
    space = spaces.find((s) => s.Id === (page?.SpaceId || spaceId));
  const live = pages.filter((p) => p.Status !== "Archived"),
    pinned = live.filter((p) => p.IsPinned);
  const tags = Array.from(new Set(live.flatMap((p) => p.Tags))).sort();
  const visible = (
    view === "archived"
      ? pages.filter((p) => p.Status === "Archived")
      : view === "saved"
        ? pages
        : live
  )
    .filter((p) =>
      view === "space"
        ? p.SpaceId === spaceId
        : view === "pinned"
          ? p.IsPinned
          : view === "saved"
            ? savedPages.savedIds.has(p.Id)
            : view === "drafts"
              ? p.Status === "Draft" && p.AuthorId === savedPages.userId
              : view === "tag"
                ? p.Tags.includes(tag)
                : true,
    )
    .filter(
      (p) =>
        view === "home" ||
        !libraryQuery.trim() ||
        `${p.Title} ${p.Summary} ${p.Tags.join(" ")} ${p.AuthorName} ${p.LastEditorName}`
          .toLowerCase()
          .includes(libraryQuery.trim().toLowerCase()),
    )
    .sort((a, b) =>
      view !== "home" && librarySort === "title"
        ? a.Title.localeCompare(b.Title, undefined, { sensitivity: "base" })
        : view !== "home" && librarySort === "oldest"
          ? a.Modified.localeCompare(b.Modified)
          : b.Modified.localeCompare(a.Modified),
    );
  const title =
    view === "home"
      ? "Knowledge home"
      : view === "space"
        ? space?.Title
        : view === "saved"
          ? "Saved for later"
          : view === "archived"
            ? "Archived pages"
            : view === "pinned"
              ? "Pinned pages"
              : view === "recent"
                ? "Recently updated"
                : view === "drafts"
                  ? "My drafts"
                  : `#${tag}`;
  const navItems = [
    { key: "home" as View, label: "Home", icon: Home },
    { key: "recent" as View, label: "Recently updated", icon: Clock3 },
    { key: "pinned" as View, label: "Pinned pages", icon: Pin },
    { key: "saved" as View, label: "Saved for later", icon: Bookmark },
    { key: "drafts" as View, label: "My drafts", icon: FileEdit },
    { key: "archived" as View, label: "Archived pages", icon: Archive },
  ];
  const totalDrafts = live.filter(
    (p) => p.Status === "Draft" && p.AuthorId === savedPages.userId,
  ).length;
  const list = (items: Page[]) => (
    <div className="document-list">
      {items.map((p) => (
        <button
          type="button"
          className="document-row"
          key={p.Id}
          onClick={() => navigate(p.Id)}
        >
          <span className="document-glyph">
            <FileText size={19} />
          </span>
          <span className="document-details">
            <strong>{p.Title}</strong>
            <small>
              {spaces.find((s) => s.Id === p.SpaceId)?.Title}
              <span>·</span>
              {p.LastEditorName}
            </small>
          </span>
          <span className={`status-badge status-${p.Status.toLowerCase()}`}>
            {p.Status}
          </span>
          <time dateTime={p.Modified}>{relative(p.Modified)}</time>
          <ChevronRight size={15} />
        </button>
      ))}
    </div>
  );
  return (
    <div className={`workspace-shell ${editor ? "is-editing" : ""}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside
        className={`workspace-sidebar ${mobile ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <a
          className="suite-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <img
            src={emblem}
            alt="Metrology Software emblem"
            width="45"
            height="45"
          />
          <span>
            <small>METROLOGY SOFTWARE</small>
            <strong>Confluence</strong>
          </span>
        </a>
        <nav className="workspace-nav">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              key={key}
              className={`workspace-nav-item ${view === key && !pageId ? "active" : ""}`}
              onClick={() => go(key)}
              aria-current={view === key && !pageId ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === "drafts" && totalDrafts > 0 && (
                <span className="nav-number">{totalDrafts}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-label">
          Spaces<span>{spaces.length}</span>
        </div>
        <div className="workspace-spaces">
          {spaces.map((s) => {
            const expanded =
              expandedSpaces.includes(s.Id) || page?.SpaceId === s.Id;
            return (
              <div className="sidebar-space" key={s.Id}>
                <div
                  className={`sidebar-space-heading ${view === "space" && spaceId === s.Id && !pageId ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="space-expand"
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${s.Title}`}
                    aria-expanded={expanded}
                    onClick={() => {
                      if (page?.SpaceId === s.Id) {
                        go("space", s.Id);
                      }
                      setExpandedSpaces((v) =>
                        expanded ? v.filter((id) => id !== s.Id) : [...v, s.Id],
                      );
                    }}
                  >
                    {expanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="space-nav-title"
                    onClick={() => {
                      go("space", s.Id);
                      setExpandedSpaces((v) =>
                        v.includes(s.Id) ? v : [...v, s.Id],
                      );
                    }}
                  >
                    <span
                      className="space-dot"
                      style={{ background: s.AccentColor }}
                    />
                    {s.Title}
                  </button>
                </div>
                {expanded && (
                  <PageTree
                    pages={live.filter((p) => p.SpaceId === s.Id)}
                    selected={pageId}
                    onNavigate={navigate}
                    onCreate={create}
                  />
                )}
              </div>
            );
          })}
          {!spaces.length && !loading && (
            <p className="sidebar-empty">Your spaces will appear here.</p>
          )}
        </div>
        <div className="workspace-account">
          {canManageWorkspace && (
            <button
              type="button"
              className="workspace-settings"
              onClick={() => setAdmin(true)}
            >
              <Settings size={17} />
              Workspace settings
            </button>
          )}
          <div className="account-summary">
            <span className="avatar">
              {(user || "Knowledge Hub")
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </span>
            <span>
              <strong>{user || "Knowledge hub"}</strong>
              <small>
                <span
                  className={`connection-dot ${service.mode === "local" ? "demo" : ""}`}
                />
                {service.mode === "local"
                  ? "Local demo"
                  : "Connected to SharePoint"}
              </small>
            </span>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <button
            type="button"
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={21} />
          </button>
          <div className="workspace-location">
            <BookOpen size={17} />
            <span>Knowledge hub</span>
          </div>
          <div className="workspace-toolbar">
            <button
              type="button"
              className="global-search"
              onClick={() => setSearch(true)}
              aria-label="Search knowledge"
            >
              <Search size={17} />
              <span>Search anything</span>
              <kbd>
                {/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K"}
              </kbd>
            </button>
            <button
              type="button"
              className="icon-button theme-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div
              className="create-control"
              ref={createRef}
              onKeyDown={(e) => {
                const actions = Array.from(
                  createRef.current?.querySelectorAll<HTMLButtonElement>(
                    '[role="menuitem"]:not(:disabled)',
                  ) || [],
                );
                if (e.key === "Escape") {
                  setCreateOpen(false);
                  createRef.current
                    ?.querySelector<HTMLButtonElement>(".create-trigger")
                    ?.focus();
                }
                if (
                  (e.key === "ArrowDown" || e.key === "ArrowUp") &&
                  createOpen
                ) {
                  e.preventDefault();
                  const at = actions.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                  actions[
                    (at +
                      (e.key === "ArrowDown" ? 1 : actions.length - 1) +
                      actions.length) %
                      actions.length
                  ]?.focus();
                }
              }}
            >
              <button
                type="button"
                className="button primary create-trigger"
                aria-haspopup="menu"
                aria-expanded={createOpen}
                onClick={() => setCreateOpen((v) => !v)}
                disabled={loading}
              >
                <Plus size={17} />
                Create
                <ChevronDown size={13} />
              </button>
              {createOpen && (
                <div
                  className="create-dropdown"
                  role="menu"
                  aria-label="Create content"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!spaces.length}
                    onClick={() => create()}
                  >
                    <FileText size={19} />
                    <span>
                      <strong>Page</strong>
                      <small>
                        {spaces.length
                          ? "Capture and share knowledge"
                          : "Create a space first"}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      transition(() => setNewSpace(true));
                    }}
                  >
                    <FolderOpen size={19} />
                    <span>
                      <strong>Space</strong>
                      <small>A home for a team or topic</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main
          id="main-content"
          className={`workspace-content ${editor ? "workspace-editing" : ""}`}
          tabIndex={-1}
        >
          {service.mode === "local" && !editor && (
            <div className="demo-notice">
              <span className="connection-dot demo" />
              Demo workspace
              <span className="demo-explanation">
                Your changes stay in this browser.
              </span>
            </div>
          )}
          {editor ? (
            <Editor
              key={editorSession}
              page={editor}
              spaces={spaces}
              pages={pages}
              onStateChange={reportEditorState}
              onDiscardRecoveryChange={registerDiscardRecovery}
              onRecoveryWarning={notify}
              onCancel={() => transition(() => void refresh())}
              onSave={async (p, note, images) => {
                const saved = await savePageWithImages(p, note, images || []);
                changed(saved);
                finishEditing();
                navigateNow(saved.Id);
                notify(
                  saved.Status === "Published"
                    ? "Page published."
                    : "Draft saved.",
                );
              }}
            />
          ) : error ? (
            <section className="error-panel" role="alert">
              <h2>We couldn’t open this workspace</h2>
              <p>{error}</p>
              {service.mode === "sharepoint" &&
                !canManageWorkspace &&
                /denied access/i.test(error) && (
                  <p>
                    Ask a site owner to check Team access in Workspace settings
                    for Metrology App User.
                  </p>
                )}
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  onClick={() => void refresh()}
                >
                  Try again
                </button>
                {canManageWorkspace && (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setAdmin(true)}
                  >
                    Workspace settings
                  </button>
                )}
              </div>
            </section>
          ) : loading ? (
            <div className="loading-workspace">
              <img src={emblem} alt="" width="64" height="64" />
              <p>Opening your workspace…</p>
            </div>
          ) : page ? (
            <ArticleReader
              key={page.Id}
              page={page}
              pages={pages}
              spaces={spaces}
              onNavigate={navigate}
              onSpace={(id) => go("space", id)}
              onEdit={() => startEditor(page)}
              onBusyChange={reportReaderBusy}
              onDuplicateCreated={(copy) => {
                changed(copy);
                navigateNow(copy.Id);
                startEditor(copy);
                notify(
                  "Draft copy created with its own attachments. You can edit it here.",
                );
              }}
              saved={savedPages.savedIds.has(page.Id)}
              savedAvailable={savedPages.available}
              onToggleSaved={() => void toggleSaved(page.Id)}
              onChanged={changed}
              onDeleted={(deleted) => {
                readerBusy.current = false;
                setPages((current) =>
                  current.filter((item) => item.Id !== deleted.Id),
                );
                go("space", deleted.SpaceId);
                void refresh();
              }}
              onToast={notify}
            />
          ) : pageId ? (
            <div className="empty-state">
              <FileText size={30} />
              <h2>This page isn’t available</h2>
              <p>It may have moved, or you may not have access.</p>
              <button
                type="button"
                className="button"
                onClick={() => go("home")}
              >
                Back to home
              </button>
            </div>
          ) : (
            <>
              <header className="workspace-page-heading">
                <div className="heading-context">
                  {view === "home"
                    ? "YOUR SHARED WORKSPACE"
                    : view === "space"
                      ? "SPACE"
                      : "LIBRARY"}
                </div>
                <div className="heading-title-row">
                  <h1>{title}</h1>
                  <span className="content-count">
                    {view === "home"
                      ? `${spaces.length} spaces · ${live.length} pages`
                      : `${visible.length} ${visible.length === 1 ? "page" : "pages"}`}
                  </span>
                </div>
                <p>
                  {view === "home"
                    ? "A home for the knowledge that moves your team forward."
                    : view === "space"
                      ? space?.Description
                      : view === "saved"
                        ? "Your personal reading list, saved in this browser."
                        : view === "archived"
                          ? "Retired pages stay available here. Open a page to restore it."
                          : view === "drafts"
                            ? "Pick up where you left off. Your unpublished work lives here."
                            : view === "pinned"
                              ? "The references your team wants to keep close."
                              : view === "recent"
                                ? "Follow what’s new and what’s changed."
                                : "Explore related guidance, decisions, and procedures."}
                </p>
              </header>
              {view === "saved" && savedPages.loading && (
                <p className="muted" role="status">
                  Opening your saved pages…
                </p>
              )}
              {(view === "saved" ||
                (view === "drafts" && !savedPages.userId)) &&
                savedPages.error && (
                  <p className="error-banner" role="alert">
                    {savedPages.error}
                  </p>
                )}
              {view === "home" && (
                <>
                  {!spaces.length ? (
                    <div className="first-workspace">
                      <h2>Good knowledge needs a home.</h2>
                      <p>
                        Start with a space for your team, then add your first
                        procedure, guide, or project page.
                      </p>
                      <div className="onboarding-steps">
                        <span>
                          <b>1</b>Choose <strong>Create → Space</strong>
                        </span>
                        <span>
                          <b>2</b>Add a page
                        </span>
                        <span>
                          <b>3</b>Share what you know
                        </span>
                      </div>
                    </div>
                  ) : (
                    <section className="space-directory">
                      <div className="workspace-section-heading">
                        <h2>Your spaces</h2>
                        <span>Organized around the way you work</span>
                      </div>
                      <div className="workspace-space-grid">
                        {spaces.map((s) => (
                          <button
                            type="button"
                            className="workspace-space-card"
                            key={s.Id}
                            onClick={() => {
                              go("space", s.Id);
                              setExpandedSpaces((v) =>
                                v.includes(s.Id) ? v : [...v, s.Id],
                              );
                            }}
                          >
                            <span
                              className="space-card-icon"
                              style={{ color: s.AccentColor }}
                            >
                              <FolderOpen size={24} />
                            </span>
                            <h3>{s.Title}</h3>
                            <p>{s.Description}</p>
                            <div>
                              <span>
                                {live.filter((p) => p.SpaceId === s.Id).length}{" "}
                                {live.filter((p) => p.SpaceId === s.Id)
                                  .length === 1
                                  ? "page"
                                  : "pages"}
                              </span>
                              <ArrowRight size={16} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {pinned.length > 0 && (
                    <section className="pinned-section">
                      <div className="workspace-section-heading">
                        <h2>
                          <Pin size={16} />
                          Pinned for the team
                        </h2>
                        <span>Start with the essentials</span>
                      </div>
                      <div className="workspace-pinned-grid">
                        {pinned.slice(0, 3).map((p) => (
                          <button
                            type="button"
                            className="workspace-pinned-card"
                            key={p.Id}
                            onClick={() => navigate(p.Id)}
                          >
                            <span className="pinned-space">
                              <span
                                className="space-dot"
                                style={{
                                  background: spaces.find(
                                    (s) => s.Id === p.SpaceId,
                                  )?.AccentColor,
                                }}
                              />
                              {spaces.find((s) => s.Id === p.SpaceId)?.Title}
                            </span>
                            <h3>{p.Title}</h3>
                            <p>{p.Summary}</p>
                            <span className="pinned-footer">
                              <FileText size={14} />
                              {Math.max(
                                1,
                                Math.ceil(
                                  contentText(p.Content).split(/\s+/).length /
                                    220,
                                ),
                              )}{" "}
                              min read
                              <ArrowUpRight size={15} />
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
              {(spaces.length > 0 || view !== "home") && (
                <div
                  className={`workspace-library ${tags.length && view !== "saved" && view !== "archived" ? "with-topics" : ""}`}
                >
                  <section className="activity-section">
                    <div className="workspace-section-heading">
                      <h2>
                        {view === "home"
                          ? "Recently updated"
                          : view === "space"
                            ? "Pages in this space"
                            : "Pages"}
                      </h2>
                      {view === "home" && (
                        <span>The latest from across your spaces</span>
                      )}
                    </div>
                    {view !== "home" && (
                      <div className="library-toolbar">
                        <label className="library-filter">
                          <Search size={16} aria-hidden="true" />
                          <input
                            type="search"
                            aria-label="Filter pages"
                            placeholder="Filter titles, tags or authors…"
                            value={libraryQuery}
                            onChange={(event) =>
                              setLibraryQuery(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                !event.nativeEvent.isComposing
                              )
                                event.preventDefault();
                            }}
                          />
                        </label>
                        <label className="library-sort">
                          Sort by
                          <select
                            aria-label="Sort pages"
                            value={librarySort}
                            onChange={(event) =>
                              setLibrarySort(event.target.value)
                            }
                          >
                            <option value="updated">Recently updated</option>
                            <option value="title">Title A–Z</option>
                            <option value="oldest">Oldest update</option>
                          </select>
                        </label>
                      </div>
                    )}
                    {visible.length ? (
                      list(visible.slice(0, view === "home" ? 6 : undefined))
                    ) : (
                      <div className="library-empty">
                        <FileText size={30} />
                        <h3>
                          {libraryQuery.trim()
                            ? "No matching pages."
                            : view === "drafts"
                              ? "You’re all caught up."
                              : "Nothing here yet."}
                        </h3>
                        <p>
                          {libraryQuery.trim()
                            ? "Try another title, tag, or author."
                            : view === "saved"
                              ? "Open a page and choose More page actions → Save for later."
                              : view === "archived"
                                ? "Pages you archive will appear here, away from the active workspace."
                                : view === "drafts"
                                  ? "Drafts appear here when you save a page without publishing."
                                  : "Use Create → Page to add knowledge to this space."}
                        </p>
                      </div>
                    )}
                  </section>
                  {tags.length > 0 &&
                    view !== "saved" &&
                    view !== "archived" && (
                      <aside className="topic-directory">
                        <div className="workspace-section-heading">
                          <h2>Explore topics</h2>
                        </div>
                        <p>Follow a thread of knowledge.</p>
                        <div className="workspace-tag-list">
                          {tags.slice(0, 24).map((t) => (
                            <button
                              type="button"
                              className={`topic-chip ${view === "tag" && tag === t ? "active" : ""}`}
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
                        </div>
                      </aside>
                    )}
                </div>
              )}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>Metrology Software</span>
          <span>Knowledge is better when it’s shared.</span>
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
      {discardOpen && (
        <Modal
          title="Discard unsaved changes?"
          onClose={() => {
            if (discardBusy) return;
            pendingNavigation.current = null;
            setDiscardOpen(false);
          }}
        >
          <p className="discard-description">
            Your latest changes have not been saved. Keep editing to finish your
            page, or discard them to leave.
          </p>
          <div className="button-row discard-actions">
            <button
              type="button"
              className="button"
              disabled={discardBusy}
              onClick={() => {
                pendingNavigation.current = null;
                setDiscardOpen(false);
              }}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="button danger"
              disabled={discardBusy}
              onClick={async () => {
                setDiscardBusy(true);
                editorState.current.busy = true;
                try {
                  await discardEditorRecovery.current?.();
                  const action = pendingNavigation.current;
                  pendingNavigation.current = null;
                  setDiscardOpen(false);
                  finishEditing();
                  action?.();
                } catch (failure) {
                  editorState.current.busy = false;
                  notify(
                    failure instanceof Error
                      ? failure.message
                      : "The local recovery copy could not be removed. Your edits are still open.",
                  );
                } finally {
                  setDiscardBusy(false);
                }
              }}
            >
              {discardBusy ? "Discarding…" : "Discard changes"}
            </button>
          </div>
        </Modal>
      )}
      {admin && canManageWorkspace && (
        <SetupDialog
          onClose={() => setAdmin(false)}
          onSiteChange={(url) => {
            setAdmin(false);
            transition(() => location.assign(url));
          }}
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
            setExpandedSpaces((v) => [...v, s.Id]);
            notify("Space created.");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
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
  const searchBodies = useMemo(
    () => new Map(pages.map((p) => [p.Id, contentText(p.Content)])),
    [pages],
  );
  const results = useMemo(
    () =>
      pages
        .filter(
          (p) =>
            (!space || p.SpaceId === +space) &&
            (status ? p.Status === status : p.Status !== "Archived") &&
            (!tag || p.Tags.includes(tag)) &&
            (!after || p.Modified.slice(0, 10) >= after) &&
            `${p.Title} ${p.Summary} ${searchBodies.get(p.Id)} ${p.Tags.join(" ")} ${p.AuthorName} ${p.LastEditorName}`
              .toLowerCase()
              .includes(q.toLowerCase()),
        )
        .sort((a, b) => b.Modified.localeCompare(a.Modified)),
    [pages, searchBodies, q, space, status, tag, after],
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
              <option value="">Active pages</option>
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
            const body = `${p.Summary || ""} ${searchBodies.get(p.Id) || ""}`;
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
  onSiteChange,
}: {
  onClose: () => void;
  onReady: () => Promise<void>;
  onSiteChange: (url: string) => void;
}) {
  const [checks, setChecks] = useState<
      { title: string; exists: boolean; missingFields: string[] }[]
    >([]),
    [busy, setBusy] = useState(false),
    [accessBusy, setAccessBusy] = useState(false),
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
  const useSite = () => {
    if (busy || accessBusy) return;
    setError("");
    try {
      if (!site.trim())
        throw new Error("Enter the SharePoint site's base URL first.");
      const url = new URL(site.trim());
      if (url.origin !== location.origin)
        throw new Error(
          "Open this HTML on the SharePoint origin first. Cross-origin connections are not supported.",
        );
      const current = new URL(location.href);
      current.searchParams.set("siteUrl", url.href);
      onSiteChange(current.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void check();
  }, []);
  return (
    <Modal
      title="Workspace settings"
      onClose={() => {
        if (!busy && !accessBusy) onClose();
      }}
    >
      <p>
        Four SharePoint lists store your spaces, pages, revision history, and
        discussions. Setup is repeatable and adds only missing lists and
        columns.
      </p>
      <div className="notice">
        {service.mode === "local"
          ? "You’re in local demo mode. Setup below checks the browser adapter; it does not create SharePoint lists."
          : "Workspace settings are available to site owners. SharePoint enforces your permissions; list setup also requires Manage Lists permission."}
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
          disabled={busy || accessBusy}
          onClick={() => void check()}
        >
          Check again
        </button>
        <button
          type="button"
          className="button primary"
          disabled={
            busy ||
            accessBusy ||
            service.mode === "local" ||
            (checks.length > 0 &&
              checks.every((c) => c.exists && !c.missingFields.length))
          }
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
          {busy
            ? "Checking…"
            : checks.length > 0 &&
                checks.every((c) => c.exists && !c.missingFields.length)
              ? "Setup complete"
              : "Create missing lists & fields"}
        </button>
      </div>
      <fieldset className="settings-access" disabled={busy}>
        <GroupAccessPanel onBusyChange={setAccessBusy} />
      </fieldset>
      <hr />
      <details className="connection-details">
        <summary>Connection settings</summary>
        <h3>SharePoint site</h3>
        <p>
          {service.mode === "sharepoint"
            ? "Your SharePoint site was detected automatically. Leave this empty unless you need to change sites."
            : "Open this app on your SharePoint site to connect. If automatic detection is unavailable, enter the site’s base URL—not the page or HTML file address."}
        </p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            useSite();
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!e.repeat) useSite();
                }
              }}
            />
          </label>
          <button
            className="button"
            type="button"
            disabled={busy || accessBusy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              useSite();
            }}
          >
            Use this site
          </button>
        </form>
      </details>
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
  const submitting = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const createSpace = async () => {
    if (submitting.current) return;
    if (!title.trim()) {
      setError("Enter a space name before creating the space.");
      nameInput.current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onCreate(title.trim(), description.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Create a space"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        noValidate
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void createSpace();
        }}
      >
        <label>
          Space name
          <input
            ref={nameInput}
            autoFocus
            required
            maxLength={100}
            disabled={busy}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.stopPropagation();
                if (!e.repeat) void createSpace();
              }
            }}
            placeholder="e.g. Metrology & Lab Ops"
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            disabled={busy}
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
            type="button"
            className="button primary"
            disabled={busy}
            onClick={(e) => {
              // Sandboxed SharePoint embeds may allow scripts but forbid native
              // form submission, suppressing onSubmit before React receives it.
              e.preventDefault();
              e.stopPropagation();
              void createSpace();
            }}
          >
            {busy ? "Creating…" : "Create space"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
