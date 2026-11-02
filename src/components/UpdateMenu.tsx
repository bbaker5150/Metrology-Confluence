import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileEdit, LogOut } from "lucide-react";

export default function UpdateMenu({
  published,
  busy,
  blocked,
  onSave,
  onClose,
  onOpen,
}: {
  published: boolean;
  busy: boolean;
  blocked: boolean;
  onSave: (status: "Draft" | "Published") => void;
  onClose: () => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div
      className="update-control"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
          ref.current
            ?.querySelector<HTMLButtonElement>(".update-toggle")
            ?.focus();
        }
      }}
    >
      <div className="update-split">
        <button
          type="button"
          className="button primary"
          disabled={busy || blocked}
          onClick={() => onSave("Published")}
          title={
            published
              ? "Save changes to the published page and record a revision"
              : "Publish this page for your team"
          }
        >
          {busy ? "Saving…" : published ? "Update" : "Publish"}
        </button>
        <button
          type="button"
          className="button primary update-toggle"
          aria-label="Page save options"
          aria-expanded={open}
          aria-controls="page-save-options"
          disabled={busy}
          onClick={() => {
            if (!open) onOpen();
            setOpen(!open);
          }}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {open && (
        <div
          className="update-options"
          id="page-save-options"
          role="group"
          aria-label="Page save options"
        >
          <button
            type="button"
            disabled={busy || blocked}
            onClick={() => {
              setOpen(false);
              onSave("Published");
            }}
          >
            <Check size={17} />
            <span>
              <strong>{published ? "Save changes" : "Publish page"}</strong>
              <small>
                {published
                  ? "Update the published page and record a revision."
                  : "Publish this page for everyone with workspace access."}
              </small>
            </span>
          </button>
          <button
            aria-label="Save draft"
            aria-describedby="save-draft-description"
            type="button"
            disabled={busy || blocked}
            onClick={() => {
              setOpen(false);
              onSave("Draft");
            }}
          >
            <FileEdit size={17} />
            <span>
              <strong>Save draft</strong>
              <small id="save-draft-description">
                {published
                  ? "Change this shared page to Draft. It will no longer be Published."
                  : "Save a shared draft. Other workspace members can read and edit it."}
              </small>
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label="Close editor"
            aria-describedby="close-editor-description"
            onClick={() => {
              setOpen(false);
              onClose();
            }}
          >
            <LogOut size={17} />
            <span>
              <strong>Close</strong>
              <small id="close-editor-description">
                Leave without saving. You’ll be asked before discarding changes.
              </small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
