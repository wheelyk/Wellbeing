import { useEffect, useRef, useState } from "react";

// Matches ENTRY_TYPE_ICON in DashboardSummary.tsx - same four types, same icons, so a user
// recognizes "🙂 Mood" here as the same thing they've already seen in the unified Recent
// entries list above. Hardcoded, not derived from a shared constant, for the same reason the
// four Section components are each their own file rather than one generic loop over a config
// array - see this project's established "adding a log type means adding a file" convention.
const QUICK_ADD_ITEMS: Array<{ key: string; label: string; icon: string }> = [
  { key: "mood", label: "Mood", icon: "🙂" },
  { key: "symptom", label: "Symptom", icon: "🩺" },
  { key: "medication", label: "Medication", icon: "💊" },
  { key: "habit", label: "Habit", icon: "✅" },
];

// A viewport-fixed "+" that jumps to any of the four Dashboard sections, for a user who's
// scrolled past the one they want without having to scroll back up and hunt for it. It scrolls
// to the section rather than opening its form directly - each section owns its own form/collapse
// state independently (no shared store between them, by design), so remotely triggering "open
// this section's form" from here would mean either lifting that state up or wiring a cross-
// component event bus for a single convenience button. Scrolling there and using that section's
// own now-visible "+" is a smaller, more honest tradeoff than either.
export function QuickAddFab() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function goToSection(key: string) {
    setOpen(false);
    document.getElementById(`dashboard-section-${key}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-20">
      {open && (
        <div
          role="menu"
          aria-label="Jump to a section"
          className="absolute bottom-16 right-0 flex min-w-40 flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
        >
          {QUICK_ADD_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => goToSection(item.key)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Quick add"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          className="h-6 w-6"
        >
          <path d="M10 4v12M4 10h12" />
        </svg>
      </button>
    </div>
  );
}
