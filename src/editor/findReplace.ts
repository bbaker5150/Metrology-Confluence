import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export interface DocumentSearchOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

export interface DocumentSearchMatch {
  from: number;
  to: number;
}

export interface DocumentSearchState {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  matches: DocumentSearchMatch[];
  activeIndex: number;
  decorations: DecorationSet;
  reveal: number;
}

type SearchAction =
  | { type: "search"; query: string; options: DocumentSearchOptions }
  | { type: "clear" }
  | { type: "navigate"; index: number }
  | { type: "replace"; anchor: number };

const documentSearchKey = new PluginKey<DocumentSearchState>("documentSearch");
const emptyState = (): DocumentSearchState => ({
  query: "",
  matchCase: false,
  wholeWord: false,
  matches: [],
  activeIndex: -1,
  decorations: DecorationSet.empty,
  reveal: 0,
});

// Keep original UTF-16 boundaries when case folding expands a character (e.g. İ).
// Searching uses literal indexOf, never a regular expression supplied by a user.
function foldText(text: string) {
  let folded = "";
  let originalOffset = 0;
  const boundaries = new Map<number, number>([[0, 0]]);
  for (const character of text) {
    folded += character.toLowerCase();
    originalOffset += character.length;
    boundaries.set(folded.length, originalOffset);
  }
  return { text: folded, boundaries };
}

function isWordCharacter(character: string | undefined) {
  return character !== undefined && /[\p{L}\p{N}\p{M}_]/u.test(character);
}

function findInText(
  text: string,
  start: number,
  query: string,
  options: DocumentSearchOptions,
): DocumentSearchMatch[] {
  const folded = options.matchCase ? undefined : foldText(text);
  const haystack = folded?.text ?? text;
  const needle = options.matchCase ? query : query.toLowerCase();
  const matches: DocumentSearchMatch[] = [];
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) break;
    const end = found + needle.length;
    const from = folded ? folded.boundaries.get(found) : found;
    const to = folded ? folded.boundaries.get(end) : end;
    if (from !== undefined && to !== undefined) {
      const before = Array.from(text.slice(Math.max(0, from - 2), from)).at(-1);
      const after = text.codePointAt(to);
      if (
        !options.wholeWord ||
        (!isWordCharacter(before) &&
          !isWordCharacter(
            after === undefined ? undefined : String.fromCodePoint(after),
          ))
      ) {
        matches.push({ from: start + from, to: start + to });
      }
    }
    cursor = end;
  }
  return matches;
}

/** Search visible text, joining adjacent marks but never paragraphs or inline atoms. */
export function findDocumentMatches(
  doc: ProseMirrorNode,
  query: string,
  options: DocumentSearchOptions = {},
): DocumentSearchMatch[] {
  if (!query) return [];
  const matches: DocumentSearchMatch[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true;
    let segment = "";
    let segmentStart = 0;
    const flush = () => {
      if (segment)
        matches.push(...findInText(segment, segmentStart, query, options));
      segment = "";
    };
    node.forEach((child, offset) => {
      if (!child.isText) {
        flush();
        return;
      }
      if (!segment) segmentStart = position + 1 + offset;
      segment += child.text ?? "";
    });
    flush();
    return false;
  });
  return matches;
}

function decorationsFor(doc: ProseMirrorNode, state: DocumentSearchState) {
  return DecorationSet.create(
    doc,
    state.matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class:
          index === state.activeIndex
            ? "document-find-match document-find-match-active"
            : "document-find-match",
      }),
    ),
  );
}

export function getDocumentSearchState(editor: Editor): DocumentSearchState {
  return documentSearchKey.getState(editor.state) ?? emptyState();
}

function revealActiveMatch(view: EditorView) {
  const state = documentSearchKey.getState(view.state);
  const match = state?.matches[state.activeIndex];
  if (!match) return;
  const dom = view.domAtPos(match.from).node;
  let ancestor = dom instanceof Element ? dom : dom.parentElement;
  while (ancestor && ancestor !== view.dom) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  const highlight = view.dom.querySelector(".document-find-match-active");
  // JSDOM has no layout API; browser scrolls without taking focus from Find text.
  highlight?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentSearch: {
      setDocumentSearch: (
        query: string,
        options?: DocumentSearchOptions,
      ) => ReturnType;
      clearDocumentSearch: () => ReturnType;
      nextDocumentSearchMatch: () => ReturnType;
      previousDocumentSearchMatch: () => ReturnType;
      replaceDocumentSearchMatch: (replacement: string) => ReturnType;
      replaceAllDocumentSearchMatches: (replacement: string) => ReturnType;
    };
  }
}

export const SearchReplace = Extension.create({
  name: "documentSearch",

  addCommands() {
    return {
      setDocumentSearch:
        (query, options = {}) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(documentSearchKey, {
              type: "search",
              query,
              options,
            } satisfies SearchAction).setMeta("addToHistory", false);
          }
          return true;
        },
      clearDocumentSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(documentSearchKey, {
              type: "clear",
            } satisfies SearchAction).setMeta("addToHistory", false);
          }
          return true;
        },
      nextDocumentSearchMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const search = documentSearchKey.getState(state);
          if (!search?.matches.length) return false;
          const index = (search.activeIndex + 1) % search.matches.length;
          const match = search.matches[index];
          if (dispatch) {
            tr.setMeta(documentSearchKey, {
              type: "navigate",
              index,
            } satisfies SearchAction)
              .setMeta("addToHistory", false)
              .setSelection(TextSelection.create(tr.doc, match.from, match.to));
          }
          return true;
        },
      previousDocumentSearchMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const search = documentSearchKey.getState(state);
          if (!search?.matches.length) return false;
          const index =
            (search.activeIndex + search.matches.length - 1) %
            search.matches.length;
          const match = search.matches[index];
          if (dispatch) {
            tr.setMeta(documentSearchKey, {
              type: "navigate",
              index,
            } satisfies SearchAction)
              .setMeta("addToHistory", false)
              .setSelection(TextSelection.create(tr.doc, match.from, match.to));
          }
          return true;
        },
      replaceDocumentSearchMatch:
        (replacement) =>
        ({ editor, state, tr, dispatch }) => {
          const search = documentSearchKey.getState(state);
          const match = search?.matches[search.activeIndex];
          if (!editor.isEditable || !match) return false;
          if (dispatch) {
            closeHistory(tr);
            tr.insertText(replacement, match.from, match.to).setMeta(
              documentSearchKey,
              {
                type: "replace",
                anchor: match.from + replacement.length,
              } satisfies SearchAction,
            );
          }
          return true;
        },
      replaceAllDocumentSearchMatches:
        (replacement) =>
        ({ editor, state, tr, dispatch }) => {
          const search = documentSearchKey.getState(state);
          if (!editor.isEditable || !search?.matches.length) return false;
          if (dispatch) {
            closeHistory(tr);
            // Descending positions keep every original match valid in one undo step.
            for (const match of [...search.matches].reverse()) {
              tr.insertText(replacement, match.from, match.to);
            }
            tr.setMeta(documentSearchKey, {
              type: "replace",
              anchor: 0,
            } satisfies SearchAction);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DocumentSearchState>({
        key: documentSearchKey,
        state: {
          init: emptyState,
          apply(transaction, previous) {
            const action = transaction.getMeta(documentSearchKey) as
              SearchAction | undefined;
            if (action?.type === "clear") return emptyState();
            if (!action && !transaction.docChanged) return previous;
            const next = { ...previous };
            if (action?.type === "search") {
              next.query = action.query;
              next.matchCase = action.options.matchCase ?? false;
              next.wholeWord = action.options.wholeWord ?? false;
            }
            if (transaction.docChanged || action?.type === "search") {
              next.matches = findDocumentMatches(
                transaction.doc,
                next.query,
                next,
              );
              if (!next.matches.length) next.activeIndex = -1;
              else if (action?.type === "search") next.activeIndex = 0;
              else {
                const oldMatch = previous.matches[previous.activeIndex];
                const anchor =
                  action?.type === "replace"
                    ? action.anchor
                    : oldMatch
                      ? transaction.mapping.map(oldMatch.from, -1)
                      : 0;
                const nearest = next.matches.findIndex(
                  (match) => match.from >= anchor,
                );
                next.activeIndex = nearest === -1 ? 0 : nearest;
              }
            }
            if (action?.type === "navigate") next.activeIndex = action.index;
            if (action) next.reveal = previous.reveal + 1;
            next.decorations = decorationsFor(transaction.doc, next);
            return next;
          },
        },
        props: {
          decorations(state) {
            return documentSearchKey.getState(state)?.decorations;
          },
        },
        appendTransaction(transactions, _oldState, newState) {
          if (
            transactions.some(
              (transaction) =>
                (
                  transaction.getMeta(documentSearchKey) as
                    SearchAction | undefined
                )?.type === "replace",
            )
          ) {
            // Close the far side too: immediate typing must not merge into Replace all.
            return closeHistory(newState.tr).setMeta("addToHistory", false);
          }
          return null;
        },
        view() {
          return {
            update(view, previousState) {
              const state = documentSearchKey.getState(view.state);
              if (
                state?.reveal !==
                documentSearchKey.getState(previousState)?.reveal
              ) {
                revealActiveMatch(view);
              }
            },
          };
        },
      }),
    ];
  },
});
