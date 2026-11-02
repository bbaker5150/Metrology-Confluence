import { useRef, useState } from "react";
import type { Page, Space } from "../types";
import { PageDeletionError, service } from "../services/sharepointService";
import Modal from "./Modal";

export type WorkspaceItemAction =
  | { kind: "rename" | "color" | "deleteSpace"; space: Space }
  | { kind: "deletePage"; page: Page };
const colors = [
  "#207de9",
  "#22a885",
  "#8b5cf6",
  "#dd8c16",
  "#e05252",
  "#db4e91",
  "#0891b2",
  "#64748b",
  "#2c6e49",
  "#9a6538",
];
export default function WorkspaceItemDialog({
  action,
  pages,
  onClose,
  onSpaceChanged,
  onSpaceDeleted,
  onPageDeleted,
  onBusy,
}: {
  action: WorkspaceItemAction;
  pages: Page[];
  onClose: () => void;
  onSpaceChanged: (space: Space) => void;
  onSpaceDeleted: (space: Space) => void;
  onPageDeleted: (page: Page) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [value, setValue] = useState(
    action.kind === "rename"
      ? action.space.Title
      : action.kind === "color"
        ? action.space.AccentColor
        : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false);
  const pending = useRef(false);
  const deleting =
    action.kind === "deletePage" || action.kind === "deleteSpace";
  const label = {
    rename: "Rename space",
    color: "Space color",
    deleteSpace: "Delete space",
    deletePage: "Delete page",
  }[action.kind];
  const count =
    action.kind === "deleteSpace"
      ? pages.filter((p) => p.SpaceId === action.space.Id).length
      : action.kind === "deletePage"
        ? pages.filter((p) => p.ParentPageId === action.page.Id).length
        : 0;
  async function submit() {
    if (pending.current || blocked || (deleting && count)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    onBusy(true);
    try {
      if (action.kind === "deletePage") {
        await service.deletePage(action.page.Id);
        onBusy(false);
        onPageDeleted(action.page);
      } else if (action.kind === "deleteSpace") {
        await service.deleteSpace(action.space.Id);
        onBusy(false);
        onSpaceDeleted(action.space);
      } else
        onSpaceChanged(
          await service.updateSpace(
            action.space.Id,
            action.kind === "rename"
              ? { Title: value }
              : { AccentColor: value },
          ),
        );
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The change could not be completed.",
      );
      setBlocked(e instanceof PageDeletionError);
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <Modal
      title={label}
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <div
        className="workspace-item-dialog"
        aria-busy={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
            e.preventDefault();
            e.stopPropagation();
            void submit();
          }
        }}
      >
        {action.kind === "rename" && (
          <label>
            Space name
            <input
              autoFocus
              maxLength={255}
              value={value}
              disabled={busy}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}
        {action.kind === "color" && (
          <>
            <p>
              Choose a color for “{action.space.Title}”. Everyone in the
              workspace will see this color.
            </p>
            <div className="space-color-swatches">
              {colors.map((color) => (
                <button
                  type="button"
                  key={color}
                  aria-label={`Choose ${color}`}
                  aria-pressed={value.toLowerCase() === color}
                  style={{ background: color }}
                  disabled={busy}
                  onClick={() => setValue(color)}
                />
              ))}
            </div>
            <div className="space-custom-color">
              <label>
                Custom color
                <input
                  aria-label="Choose custom color"
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#207de9"}
                  disabled={busy}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <label>
                Hex color
                <input
                  value={value}
                  maxLength={7}
                  disabled={busy}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
            </div>
          </>
        )}
        {deleting && (
          <>
            <p>
              Delete “
              {action.kind === "deletePage"
                ? action.page.Title
                : action.space.Title}
              ”?
            </p>
            <p>
              {service.mode === "sharepoint"
                ? "The item will move to the SharePoint recycle bin."
                : "It will be removed from this browser’s demo workspace. This cannot be undone here."}
            </p>
            {count > 0 && (
              <div className="error-banner">
                {action.kind === "deleteSpace"
                  ? "Move or delete every page in this space first"
                  : "Move or delete this page’s child pages first"}
                , including drafts and archived pages. Pages are never deleted
                automatically.
              </div>
            )}
          </>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="button-row">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            {blocked ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            className={`button ${deleting ? "delete-page-button" : "primary"}`}
            disabled={busy || blocked || (deleting && count > 0)}
            onClick={() => void submit()}
          >
            {busy ? "Working…" : deleting ? label : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
