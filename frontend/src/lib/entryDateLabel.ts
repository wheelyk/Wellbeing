export function formatEntryTime(loggedAt: string): string {
  return new Date(loggedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Used everywhere a log entry's timestamp is shown next to others that might span more than one
// calendar day (the Dashboard's unified "Recent entries" list, and each per-type "Recent X
// entries" list) - a bare time like "4:28 PM" reads as "today" by default, which is only
// actually true for same-day entries. Compares calendar days in the browser's own local
// timezone, same as formatEntryTime above - not the user's app-configured timezone, which none
// of these lists fetch; entries can't be usefully split into calendar days without a timezone in
// the first place, and the two would only actually disagree if someone were reading the app from
// a different timezone than the one saved in their own profile.
export function formatEntryDateLabel(loggedAt: string): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const entryDay = startOfDay(new Date(loggedAt));
  const today = startOfDay(new Date());
  const diffDays = Math.round((today.getTime() - entryDay.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return entryDay.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: entryDay.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function formatEntryDateTime(loggedAt: string): string {
  return `${formatEntryDateLabel(loggedAt)}, ${formatEntryTime(loggedAt)}`;
}
