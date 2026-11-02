import { useRef, useState } from "react";
import { Archive, Copy, FolderInput, RotateCcw } from "lucide-react";
import type { Page, Space } from "../types";
import {
  archivePage,
  descendantPageIds,
  duplicatePage,
  movePage,
  PageOperationError,
  restoreArchivedPage,
} from "../services/pageOperations";
import Modal from "./Modal";
import { service } from "../services/sharepointService";

export type PageManagementAction = "duplicate" | "move" | "archive" | "restore";
interface Props {
  action: PageManagementAction;
  page: Page;
  pages: Page[];
  spaces: Space[];
  onClose: () => void;
  onChanged: (page: Page) => void;
  onDuplicateCreated: (page: Page) => void;
  onNavigate: (id: number) => void;
  onToast: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}

const titles = {
  duplicate: "Duplicate page",
  move: "Move page",
  archive: "Archive page",
  restore: "Restore archived page",
};

export default function PageManagementDialog({
  action,
  page,
  pages,
  spaces,
  onClose,
  onChanged,
  onDuplicateCreated,
  onNavigate,
  onToast,
  onBusyChange,
}: Props) {
  const originalParent = pages.find((item) => item.Id === page.ParentPageId);
  const [title, setTitle] = useState(`Copy of ${page.Title}`.slice(0, 255));
  const [spaceId, setSpaceId] = useState(page.SpaceId);
  const [parentId, setParentId] = useState<number | null>(
    originalParent &&
      originalParent.Status !== "Archived" &&
      originalParent.SpaceId === page.SpaceId
      ? originalParent.Id
      : null,
  );
  const [restoreStatus, setRestoreStatus] = useState<"Draft" | "Published">(
    "Draft",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryBlocked, setRetryBlocked] = useState(false);
  const [partialPageId, setPartialPageId] = useState<number>();
  const pending = useRef(false);
  const descendants = descendantPageIds(pages, page.Id);
  const activeChildren = pages.filter(
    (item) => descendants.has(item.Id) && item.Status !== "Archived",
  );
  const parents = pages.filter(
    (item) =>
      item.SpaceId === spaceId &&
      item.Status !== "Archived" &&
      (action === "duplicate" ||
        (item.Id !== page.Id && !descendants.has(item.Id))),
  );
  const archiveBlocked = action === "archive" && activeChildren.length > 0;
  const restoreBlocked =
    action === "restore" &&
    Boolean(
      page.ParentPageId &&
      (!originalParent || originalParent.Status === "Archived"),
    );
  const unchanged =
    action === "move" &&
    spaceId === page.SpaceId &&
    parentId === page.ParentPageId;
  const close = () => {
    if (!pending.current) onClose();
  };

  async function submit() {
    if (
      pending.current ||
      retryBlocked ||
      archiveBlocked ||
      restoreBlocked ||
      unchanged
    )
      return;
    if (action === "duplicate" && !title.trim()) {
      setError("Enter a title for the copy.");
      return;
    }
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const updated =
        action === "duplicate"
          ? await duplicatePage(page, {
              title: title.trim(),
              spaceId,
              parentPageId: parentId,
            })
          : action === "move"
            ? await movePage(page, { spaceId, parentPageId: parentId })
            : action === "archive"
              ? await archivePage(page)
              : await restoreArchivedPage(page, restoreStatus);
      onClose();
      if (action === "duplicate") {
        onDuplicateCreated(updated);
        onToast(
          "Draft copy created with its attachments. You can continue editing.",
        );
      } else {
        onChanged(updated);
        onToast(
          action === "move"
            ? "Page moved."
            : action === "archive"
              ? "Page archived."
              : `Page restored as ${restoreStatus.toLowerCase()}.`,
        );
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The action could not be completed.",
      );
      setRetryBlocked(
        failure instanceof PageOperationError && failure.retryBlocked,
      );
      setPartialPageId(
        failure instanceof PageOperationError
          ? failure.partialPageId
          : undefined,
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function openPartialDraft() {
    if (!partialPageId || pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      const draft = (await service.getPages()).find(
        (item) => item.Id === partialPageId,
      );
      if (!draft)
        throw new Error(
          "The partial draft is not available. Reload the workspace to check its latest state.",
        );
      onChanged(draft);
      onClose();
      // Release the navigation guard once this read has completed.
      onBusyChange(false);
      onNavigate(draft.Id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The partial draft could not be opened.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  const Icon =
    action === "duplicate"
      ? Copy
      : action === "move"
        ? FolderInput
        : action === "archive"
          ? Archive
          : RotateCcw;
  const actionLabel =
    action === "duplicate"
      ? "Create draft copy"
      : action === "move"
        ? "Move page"
        : action === "archive"
          ? "Archive page"
          : "Restore page";
  return (
    <Modal title={titles[action]} onClose={close}>
      <div
        className="page-management"
        aria-busy={busy}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            void submit();
          }
        }}
      >
        <p className="page-management-source">{page.Title}</p>
        <p className="muted">
          {action === "duplicate"
            ? "Create an independent draft with the page content and attached files. Child pages, discussion, and previous revisions stay with the original."
            : action === "move"
              ? "Choose where this page belongs. Its link, history, and attached files stay the same."
              : action === "archive"
                ? "Remove this page from the active workspace while keeping its content, attachments, and history. Find it later in Archived pages."
                : "Bring this page back into the active workspace. Choose whether it should return as a draft or a published page."}
        </p>
        {action === "duplicate" && (
          <p className="management-note">
            The copy inherits the app list’s access. Page-specific SharePoint
            permissions on the original are not copied.
          </p>
        )}
        <fieldset
          disabled={busy || retryBlocked}
          className="page-management-fields"
        >
          {action === "duplicate" && (
            <label>
              Page title
              <input
                aria-label="Page title"
                maxLength={255}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
          )}
          {(action === "duplicate" || action === "move") && (
            <>
              <label>
                Destination space
                <select
                  aria-label="Destination space"
                  value={spaceId}
                  onChange={(event) => {
                    setSpaceId(Number(event.target.value));
                    setParentId(null);
                  }}
                >
                  {spaces.map((space) => (
                    <option
                      key={space.Id}
                      value={space.Id}
                      disabled={
                        action === "move" &&
                        descendants.size > 0 &&
                        space.Id !== page.SpaceId
                      }
                    >
                      {space.Title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Parent page
                <select
                  aria-label="Parent page"
                  value={parentId || ""}
                  onChange={(event) =>
                    setParentId(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Space root</option>
                  {parents.map((parent) => (
                    <option key={parent.Id} value={parent.Id}>
                      {parent.Title}
                    </option>
                  ))}
                </select>
              </label>
              {action === "move" && descendants.size > 0 && (
                <p className="management-note">
                  Move child pages to another location before moving this page
                  to a different space. Moving it within this space keeps its
                  child pages together.
                </p>
              )}
            </>
          )}
          {action === "restore" && (
            <label>
              Restore as
              <select
                aria-label="Restore as"
                value={restoreStatus}
                onChange={(event) =>
                  setRestoreStatus(event.target.value as "Draft" | "Published")
                }
              >
                <option value="Draft">Draft</option>
                <option value="Published">Published</option>
              </select>
            </label>
          )}
        </fieldset>
        {archiveBlocked && (
          <div className="management-note" role="status">
            Move or archive its {activeChildren.length} active child{" "}
            {activeChildren.length === 1 ? "page" : "pages"} first. Child pages
            are never archived automatically.
          </div>
        )}
        {restoreBlocked && (
          <div className="management-note" role="status">
            Move this page to an active parent or the space root before
            restoring it.
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {partialPageId && (
          <div className="management-note">
            <p>
              A partial draft may be available. Review its content and
              attachments before continuing.
            </p>
            <button
              type="button"
              className="button small"
              disabled={busy}
              onClick={() => void openPartialDraft()}
            >
              Open partial draft
            </button>
          </div>
        )}
        <div className="page-management-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            {retryBlocked ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            className="button primary"
            disabled={
              busy ||
              retryBlocked ||
              archiveBlocked ||
              restoreBlocked ||
              unchanged ||
              (action === "duplicate" && !title.trim())
            }
            onClick={() => void submit()}
          >
            <Icon size={15} />
            {busy ? "Working…" : actionLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
