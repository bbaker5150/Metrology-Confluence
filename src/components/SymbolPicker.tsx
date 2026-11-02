import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { emojiGroups, symbolEntries, tonedSymbol } from "../data/emoji";

const STORAGE = "mc-recent-symbols";
function loadRecent(): string[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(STORAGE) || "[]");
    return Array.isArray(items)
      ? items.filter((x): x is string => typeof x === "string").slice(0, 24)
      : [];
  } catch {
    return [];
  }
}
export default function SymbolPicker({
  onInsert,
}: {
  onInsert: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Faces");
  const [tone, setTone] = useState("");
  const [recent] = useState(loadRecent);
  const categories = [
    { name: "Recent", icon: "◷" },
    { name: "Measurement", icon: "Ω" },
    { name: "Math", icon: "±" },
    ...emojiGroups,
  ];
  const entries = useMemo(
    () =>
      query.trim()
        ? symbolEntries.filter((e) =>
            `${e.value} ${e.name} ${e.category}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
          )
        : category === "Recent"
          ? recent.map((value) => ({
              value,
              name: symbolEntries.find((e) => e.value === value)?.name || value,
              category,
            }))
          : symbolEntries.filter((e) => e.category === category),
    [category, query, recent],
  );
  const insert = (value: string) => {
    const rendered = tonedSymbol(value, tone);
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify(
          [rendered, ...recent.filter((v) => v !== rendered)].slice(0, 24),
        ),
      );
    } catch {
      /* Picker works without storage. */
    }
    onInsert(rendered);
  };
  return (
    <>
      <div
        className="symbol-categories"
        role="group"
        aria-label="Symbol categories"
      >
        {categories.map((c) => (
          <button
            type="button"
            key={c.name}
            title={c.name}
            aria-label={c.name}
            aria-pressed={category === c.name && !query}
            onClick={() => {
              setCategory(c.name);
              setQuery("");
            }}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="rich-picker-search">
        <Search size={16} />
        <input
          autoFocus
          aria-label="Search symbols"
          placeholder="Search emoji or symbols…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && entries[0]) {
              e.preventDefault();
              insert(entries[0].value);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              e.currentTarget
                .closest("[data-editor-popover]")
                ?.querySelector<HTMLButtonElement>(".rich-symbol-grid button")
                ?.focus();
            }
          }}
        />
        <select
          aria-label="Emoji skin tone"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
        >
          <option value="">✋ Default</option>
          <option value="🏻">✋🏻 Light</option>
          <option value="🏼">✋🏼 Medium-light</option>
          <option value="🏽">✋🏽 Medium</option>
          <option value="🏾">✋🏾 Medium-dark</option>
          <option value="🏿">✋🏿 Dark</option>
        </select>
      </div>
      <div className="symbol-results">
        <p className="symbol-category-title">
          {query ? `${entries.length} results` : category}
        </p>
        <div
          className="rich-symbol-grid"
          role="group"
          aria-label={query ? "Search results" : category}
        >
          {entries.map((e, index) => (
            <button
              type="button"
              key={e.value}
              title={e.name}
              aria-label={`Insert ${e.name}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(e.value)}
              onKeyDown={(event) => {
                const offset = {
                  ArrowRight: 1,
                  ArrowLeft: -1,
                  ArrowDown: 8,
                  ArrowUp: -8,
                }[event.key];
                if (offset !== undefined) {
                  event.preventDefault();
                  (
                    event.currentTarget.parentElement?.children[
                      Math.max(0, Math.min(entries.length - 1, index + offset))
                    ] as HTMLElement
                  )?.focus();
                }
              }}
            >
              {tonedSymbol(e.value, tone)}
            </button>
          ))}
        </div>
        {!entries.length && (
          <p className="rich-popover-note">
            {category === "Recent" && !query
              ? "Symbols you use will appear here."
              : "No matches. Try a name such as microscope, check, or sigma."}
          </p>
        )}
      </div>
    </>
  );
}
