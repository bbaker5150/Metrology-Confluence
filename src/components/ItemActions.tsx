import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export default function ItemActions({
  label,
  items,
}: {
  label: string;
  items: { label: string; danger?: boolean; run: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const button = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const rect = button.current!.getBoundingClientRect();
    setPosition({
      top: Math.min(
        rect.bottom + 5,
        window.innerHeight - items.length * 40 - 24,
      ),
      left: Math.max(8, Math.min(rect.right - 175, window.innerWidth - 185)),
    });
    menu.current?.querySelector("button")?.focus();
  }, [open, items.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (
        !button.current?.contains(e.target as Node) &&
        !menu.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const close = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`item-actions-toggle ${open ? "is-open" : ""}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="item-actions-menu"
            role="group"
            aria-label={label}
            style={position}
            onBlur={(e) => {
              if (
                !e.currentTarget.contains(e.relatedTarget) &&
                e.relatedTarget !== button.current
              )
                setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                button.current?.focus();
              }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const buttons = [...e.currentTarget.querySelectorAll("button")];
                const at = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                buttons[
                  (at + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                    buttons.length
                ]?.focus();
              }
            }}
          >
            {items.map((item) => (
              <button
                type="button"
                key={item.label}
                className={item.danger ? "danger-text" : ""}
                onClick={() => {
                  setOpen(false);
                  button.current?.focus();
                  item.run();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
