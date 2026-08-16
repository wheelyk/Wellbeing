// Formats a Date as the value a <input type="datetime-local"> expects (local time,
// "YYYY-MM-DDTHH:mm") - the input has no concept of timezones, it just shows/edits whatever
// local wall-clock time the browser is set to. Shared by every entry form that offers a
// date/time picker defaulting to "now" (originally written for MoodEntryForm, extracted here
// once HabitEntryForm needed the exact same logic - see IMPLEMENTATION_LOG.md for the habit
// entry form task).
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
