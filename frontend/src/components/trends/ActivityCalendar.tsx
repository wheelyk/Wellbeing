export interface ActivityDay {
  date: string;
  hasActivity: boolean;
}

interface ActivityCalendarProps {
  days: ActivityDay[];
}

// Monday-first, matching backend/src/lib/streak.ts's own week convention (documented there as
// "Monday-Sunday... more common convention outside the US") - kept consistent so a user browsing
// both the Dashboard's streak and this calendar isn't shown two different ideas of "start of
// week."
function weekdayIndexMondayFirst(dateStr: string): number {
  const jsDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sun ... 6 = Sat
  return jsDay === 0 ? 6 : jsDay - 1; // 0 = Mon ... 6 = Sun
}

function dayOfMonth(dateStr: string): number {
  return Number(dateStr.slice(8, 10));
}

function formatFullDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A simple calendar-style grid (requirements §10: "a simple calendar-style activity view showing
// days on which relevant activity or logging occurred") - one cell per day in the period, wrapped
// onto rows of 7 like a real calendar, with blank leading cells so the first real day lands under
// its correct weekday column.
export function ActivityCalendar({ days }: ActivityCalendarProps) {
  if (days.length === 0) {
    return <p className="mt-4 text-text-muted">Not enough data yet for this period.</p>;
  }

  const leadingBlanks = weekdayIndexMondayFirst(days[0].date);
  const cells: (ActivityDay | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...days,
  ];

  return (
    <div className="mt-4">
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-text-muted">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, index) =>
          cell === null ? (
            <div key={`blank-${index}`} aria-hidden="true" />
          ) : (
            <div
              key={cell.date}
              title={`${formatFullDate(cell.date)} — ${cell.hasActivity ? "Logged" : "Nothing logged"}`}
              aria-label={`${formatFullDate(cell.date)}: ${cell.hasActivity ? "Logged" : "Nothing logged"}`}
              className={`flex aspect-square items-center justify-center rounded-md border text-[10px] ${
                cell.hasActivity
                  ? "border-brand bg-brand/15 font-semibold text-brand-dark"
                  : "border-border bg-surface-muted text-text-muted"
              }`}
            >
              {/* A checkmark glyph replaces the day number on a logged day, rather than only the
                  cell's color/border changing - per requirements §15 ("avoid relying on colour
                  alone to communicate meaning"), so the distinction still reads without color
                  (e.g. in a screenshot converted to grayscale, or for a colorblind user). */}
              {cell.hasActivity ? "✓" : dayOfMonth(cell.date)}
            </div>
          ),
        )}
      </div>
      <p className="mt-2 flex items-center gap-2 text-xs text-text-muted">
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded border border-brand bg-brand/15 text-[9px] font-semibold text-brand-dark"
          aria-hidden="true"
        >
          ✓
        </span>
        Day with logged activity (medications or categories)
      </p>
    </div>
  );
}
