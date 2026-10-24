"use client";
import { useId, useState, type ReactNode } from "react";

export function Tabs({ label, items }: { label: string; items: Array<{ id: string; label: string; content: ReactNode }> }) {
  const base = useId();
  const [active, setActive] = useState(items[0]?.id ?? "");
  const idx = Math.max(0, items.findIndex((i) => i.id === active));
  const current = items[idx];
  return (
    <div>
      <div role="tablist" aria-label={label} className="tabs">
        {items.map((it, n) => (
          <button
            key={it.id} type="button" role="tab" id={`${base}-${it.id}`} className="tab"
            aria-selected={n === idx} aria-controls={`${base}-panel`} tabIndex={n === idx ? 0 : -1}
            onClick={() => setActive(it.id)}
            onKeyDown={(e) => {
              const move = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!move) return;
              const next = items[(idx + move + items.length) % items.length]!;
              setActive(next.id);
              requestAnimationFrame(() => document.getElementById(`${base}-${next.id}`)?.focus());
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
      {current && <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${current.id}`} className="tab-panel">{current.content}</div>}
    </div>
  );
}
