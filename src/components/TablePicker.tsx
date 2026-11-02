import { useState } from "react";

export default function TablePicker({
  onInsert,
}: {
  onInsert: (rows: number, cols: number, header: boolean) => void;
}) {
  const [size, setSize] = useState({ rows: 3, cols: 3 });
  const [header, setHeader] = useState(true);
  return (
    <div className="table-picker">
      <div
        className="table-picker-grid"
        role="group"
        aria-label="Choose table size"
      >
        {Array.from({ length: 80 }, (_, i) => {
          const rows = Math.floor(i / 10) + 1,
            cols = (i % 10) + 1;
          return (
            <button
              type="button"
              key={i}
              tabIndex={
                rows === Math.min(size.rows, 8) &&
                cols === Math.min(size.cols, 10)
                  ? 0
                  : -1
              }
              aria-label={`${cols} columns by ${rows} rows`}
              className={
                cols <= size.cols && rows <= size.rows ? "selected" : ""
              }
              onMouseEnter={() => setSize({ rows, cols })}
              onFocus={() => setSize({ rows, cols })}
              onClick={() => onInsert(rows, cols, header)}
              onKeyDown={(event) => {
                const offset = {
                  ArrowRight: 1,
                  ArrowLeft: -1,
                  ArrowDown: 10,
                  ArrowUp: -10,
                }[event.key];
                if (offset !== undefined) {
                  event.preventDefault();
                  (
                    event.currentTarget.parentElement?.children[
                      Math.max(0, Math.min(79, i + offset))
                    ] as HTMLElement
                  )?.focus();
                }
              }}
            />
          );
        })}
      </div>
      <p aria-live="polite">
        {size.cols} × {size.rows}
      </p>
      <label className="table-header-toggle">
        <input
          type="checkbox"
          checked={header}
          onChange={(e) => setHeader(e.target.checked)}
        />{" "}
        Header row
      </label>
      <div className="table-custom-size">
        <label>
          Columns
          <input
            type="number"
            min="1"
            max="20"
            value={size.cols}
            onChange={(e) =>
              setSize({
                ...size,
                cols: Math.min(20, Math.max(1, Number(e.target.value))),
              })
            }
          />
        </label>
        <label>
          Rows
          <input
            type="number"
            min="1"
            max="100"
            value={size.rows}
            onChange={(e) =>
              setSize({
                ...size,
                rows: Math.min(100, Math.max(1, Number(e.target.value))),
              })
            }
          />
        </label>
        <button
          type="button"
          className="button primary"
          onClick={() => onInsert(size.rows, size.cols, header)}
        >
          Insert table
        </button>
      </div>
    </div>
  );
}
