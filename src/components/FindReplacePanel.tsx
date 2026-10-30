import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { getDocumentSearchState } from "../editor/findReplace";
import "./findReplace.css";

interface Props {
  editor: Editor;
  onClose: () => void;
  disabled: boolean;
}

export default function FindReplacePanel({ editor, onClose, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [search, setSearch] = useState(() => getDocumentSearchState(editor));
  const findInput = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const update = () => setSearch(getDocumentSearchState(editor));
    editor.on("transaction", update);
    findInput.current?.focus();
    return () => {
      editor.off("transaction", update);
      if (!editor.isDestroyed) editor.commands.clearDocumentSearch();
    };
  }, [editor]);

  useEffect(() => {
    editor.commands.setDocumentSearch(query, { matchCase, wholeWord });
    setAnnouncement("");
  }, [editor, query, matchCase, wholeWord]);

  const canReplace =
    !disabled && editor.isEditable && search.matches.length > 0;
  const close = () => {
    editor.commands.clearDocumentSearch();
    onClose();
  };
  const replace = (all = false) => {
    if (!canReplace) return;
    const count = all ? search.matches.length : 1;
    const changed = all
      ? editor.commands.replaceAllDocumentSearchMatches(replacement)
      : editor.commands.replaceDocumentSearchMatch(replacement);
    if (changed)
      setAnnouncement(
        `Replaced ${count} ${count === 1 ? "match" : "matches"}.`,
      );
  };
  const navigate = (backwards = false) => {
    if (disabled) return;
    if (backwards) editor.commands.previousDocumentSearchMatch();
    else editor.commands.nextDocumentSearchMatch();
  };
  const inputKeys = (
    event: KeyboardEvent<HTMLInputElement>,
    isReplacement = false,
  ) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (isReplacement) replace();
    else navigate(event.shiftKey);
  };
  const count = !query
    ? "Enter text to find"
    : !search.matches.length
      ? "No matches"
      : `${search.activeIndex + 1} of ${search.matches.length} ${search.matches.length === 1 ? "match" : "matches"}`;

  return (
    <section
      className="document-find-panel"
      role="region"
      aria-label="Find and replace"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <div className="document-find-heading">
        <strong>
          <Search size={15} aria-hidden="true" />
          Find and replace
        </strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Close find and replace"
          title="Close (Esc)"
          onClick={close}
        >
          <X size={16} />
        </button>
      </div>
      <div className="document-find-row">
        <label className="document-find-field">
          <span>Find text</span>
          <input
            ref={findInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => inputKeys(event)}
            disabled={disabled}
            placeholder="Search this page’s content"
            autoComplete="off"
          />
        </label>
        <div className="document-find-navigation">
          <span
            className="document-find-count"
            role="status"
            aria-live="polite"
          >
            {count}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Previous match"
            title="Previous match (Shift+Enter)"
            disabled={disabled || !search.matches.length}
            onClick={() => navigate(true)}
          >
            <ChevronUp size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next match"
            title="Next match (Enter)"
            disabled={disabled || !search.matches.length}
            onClick={() => navigate()}
          >
            <ChevronDown size={17} />
          </button>
        </div>
      </div>
      <div className="document-find-row">
        <label className="document-find-field">
          <span>Replace with</span>
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => inputKeys(event, true)}
            disabled={disabled}
            placeholder="Leave blank to remove matches"
            autoComplete="off"
          />
        </label>
        <div className="document-find-actions">
          <button
            type="button"
            className="button"
            disabled={!canReplace}
            onClick={() => replace()}
          >
            Replace
          </button>
          <button
            type="button"
            className="button"
            disabled={!canReplace}
            onClick={() => replace(true)}
          >
            Replace all
          </button>
        </div>
      </div>
      <div className="document-find-options">
        <label>
          <input
            type="checkbox"
            checked={matchCase}
            disabled={disabled}
            onChange={(event) => setMatchCase(event.target.checked)}
          />
          Match case
        </label>
        <label>
          <input
            type="checkbox"
            checked={wholeWord}
            disabled={disabled}
            onChange={(event) => setWholeWord(event.target.checked)}
          />
          Whole words
        </label>
        <span aria-live="polite">
          {announcement || "Changes stay in this draft until you save."}
        </span>
      </div>
    </section>
  );
}
