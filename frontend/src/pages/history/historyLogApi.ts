import { apiFetch } from "../../api/client";
import type { HistoryEntryType } from "../HistoryPage";

// ---- Per-type structured records -----------------------------------------------------------
// The unified GET /api/history endpoint (see backend/src/routes/history.ts) only returns a
// display-ready {label, notes, loggedAt} shape - enough to render the list, but not enough to
// pre-fill a real edit form (e.g. a symptom entry's label is "Headache — Severity 6/10", which
// has no machine-readable symptomId in it anywhere). The actual structured fields
// (mood/energy/stress, symptomId/severity, medicationId/taken, habitId/valueX) only live on the
// four per-type endpoints, so editing has to go back to those - see findLogById below for how,
// given the backend can't be touched for this task and none of those endpoints support a
// "fetch by id" lookup.
export interface MoodLogRecord {
  id: string;
  mood: number;
  energy: number | null;
  stress: number | null;
  notes: string | null;
  loggedAt: string;
}

export interface SymptomLogRecord {
  id: string;
  symptomId: string;
  severity: number;
  notes: string | null;
  loggedAt: string;
}

export interface MedicationLogRecord {
  id: string;
  medicationId: string;
  taken: boolean;
  notes: string | null;
  loggedAt: string;
}

export interface HabitLogRecord {
  id: string;
  habitId: string;
  valueBoolean: boolean | null;
  valueNumeric: number | null;
  valueDurationMinutes: number | null;
  notes: string | null;
  loggedAt: string;
}

export interface SymptomRef {
  id: string;
  userId: string | null;
  name: string;
}

export interface MedicationRef {
  id: string;
  name: string;
  dosage: string | null;
}

export interface HabitRef {
  id: string;
  name: string;
  type: "boolean" | "numeric" | "duration";
}

const LIST_PATH: Record<HistoryEntryType, string> = {
  mood: "/api/mood-logs",
  symptom: "/api/symptom-logs",
  medication: "/api/medication-logs",
  habit: "/api/habit-logs",
};

interface LogPage<T> {
  entries: T[];
  hasMore: boolean;
}

// The four per-type log-list endpoints only support limit/offset pagination - there's no "give
// me the one with this id" lookup (adding one would mean touching backend/, out of scope for
// this task). Entries within a type are always returned newest-first, the same order the
// History list itself already sorts by, so this pages through that same order and stops as soon
// as either the target id turns up, or the current page's oldest entry is already older than
// `loggedAtHint` (the timestamp the History list already has for this entry) - at that point, if
// the target still existed, it would already have appeared on an earlier page.
async function findLogById<T extends { id: string; loggedAt: string }>(
  type: HistoryEntryType,
  id: string,
  loggedAtHint: string,
): Promise<T | null> {
  const limit = 100;
  // Generous bound (5,000 most-recent entries of this one type) against runaway paging in some
  // unexpected edge case, rather than an unbounded loop.
  const maxPages = 50;
  const targetTime = new Date(loggedAtHint).getTime();

  for (let page = 0, offset = 0; page < maxPages; page += 1, offset += limit) {
    const result = await apiFetch<LogPage<T>>(`${LIST_PATH[type]}?limit=${limit}&offset=${offset}`);
    const found = result.entries.find((entry) => entry.id === id);
    if (found) return found;

    const oldest = result.entries[result.entries.length - 1];
    if (!result.hasMore || !oldest || new Date(oldest.loggedAt).getTime() < targetTime) {
      return null;
    }
  }
  return null;
}

export function fetchMoodLog(id: string, loggedAtHint: string): Promise<MoodLogRecord | null> {
  return findLogById<MoodLogRecord>("mood", id, loggedAtHint);
}
export function fetchSymptomLog(
  id: string,
  loggedAtHint: string,
): Promise<SymptomLogRecord | null> {
  return findLogById<SymptomLogRecord>("symptom", id, loggedAtHint);
}
export function fetchMedicationLog(
  id: string,
  loggedAtHint: string,
): Promise<MedicationLogRecord | null> {
  return findLogById<MedicationLogRecord>("medication", id, loggedAtHint);
}
export function fetchHabitLog(id: string, loggedAtHint: string): Promise<HabitLogRecord | null> {
  return findLogById<HabitLogRecord>("habit", id, loggedAtHint);
}

// ---- Label formatting ------------------------------------------------------------------------
// Mirrors backend/src/routes/history.ts's own label builders exactly, so an entry just updated
// through this page's own edit flow can be reflected in HistoryPage's local `entries` list
// immediately - producing the same string the unified endpoint would produce on its next real
// fetch - without needing a full refetch just to pick up a display label.
export function moodLabel(log: {
  mood: number;
  energy: number | null;
  stress: number | null;
}): string {
  const parts = [`Mood ${log.mood}/5`];
  if (log.energy !== null) parts.push(`Energy ${log.energy}/7`);
  if (log.stress !== null) parts.push(`Stress ${log.stress}/7`);
  return parts.join(" · ");
}

export function symptomLabel(symptomName: string, severity: number): string {
  return `${symptomName} — Severity ${severity}/10`;
}

export function medicationLabel(name: string, dosage: string | null, taken: boolean): string {
  const base = dosage ? `${name} — ${dosage}` : name;
  return `${base} — ${taken ? "Taken" : "Not taken"}`;
}

export function habitValueLabel(log: {
  valueBoolean: boolean | null;
  valueNumeric: number | null;
  valueDurationMinutes: number | null;
}): string {
  if (log.valueBoolean !== null) return log.valueBoolean ? "Done" : "Not done";
  if (log.valueNumeric !== null) return `${log.valueNumeric}`;
  if (log.valueDurationMinutes !== null) return `${log.valueDurationMinutes} min`;
  return "—";
}

export function habitLabel(habitName: string, log: Parameters<typeof habitValueLabel>[0]): string {
  return `${habitName}: ${habitValueLabel(log)}`;
}
