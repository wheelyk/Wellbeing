import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MoodEntryForm, type MoodLog } from "../../components/MoodEntryForm";
import { SymptomEntryForm, type Symptom, type SymptomLog } from "../../components/SymptomEntryForm";
import { MedicationEntryForm, type MedicationLog } from "../../components/MedicationEntryForm";
import { CategoryEntryForm, type CategoryLog } from "../../components/CategoryEntryForm";
import type { Category } from "../../components/CategoryCreateForm";
import type { HistoryEntry } from "../HistoryPage";
import {
  fetchCategories,
  fetchCategoryLog,
  fetchMedicationLog,
  fetchMoodLog,
  fetchSymptomLog,
  fetchSymptoms,
  categoryLabel,
  medicationLabel,
  moodLabel,
  symptomLabel,
} from "./historyLogApi";

interface HistoryEditModalProps {
  // null means "closed" - same convention as HistoryPage's own deletingEntry state, so the
  // Modal underneath can key its open/closed state directly off whether there's an entry to
  // show rather than a separate boolean that could drift out of sync with it.
  entry: HistoryEntry | null;
  onClose: () => void;
  onSaved: (updated: HistoryEntry) => void;
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; view: ReadyView };

type ReadyView =
  | { kind: "mood"; log: MoodLog }
  | { kind: "symptom"; log: SymptomLog; symptoms: Symptom[] }
  | { kind: "medication"; log: MedicationLog }
  | { kind: "category"; log: CategoryLog; categories: Category[] };

const TYPE_TITLE: Record<HistoryEntry["type"], string> = {
  mood: "Edit mood entry",
  symptom: "Edit symptom entry",
  medication: "Edit medication entry",
  category: "Edit entry",
};

// Renders History's own pre-filled edit dialog for all four log types - fetches the full
// structured record each per-type endpoint owns (see historyLogApi.ts for why the unified
// history list alone isn't enough to pre-fill a form), then hands it to the exact same
// MoodEntryForm/SymptomEntryForm/MedicationEntryForm components the Dashboard's own Section
// components already use in edit mode (each already supports an `editingLog` prop for this - see
// MoodEntryForm's own comment on why one form serves both create and edit). Habit had a fourth
// branch here too until Phase 17 folded it into Category - a former habit's entries now go
// through the same CategoryEntryForm branch below as any other category.
// This used to be a fully self-contained, ~800-line duplicate of those forms - built that
// way deliberately while a parallel workstream was also editing the Section components, to avoid
// a guaranteed merge conflict (see the implementation log entry on the design-review-driven
// History edit-parity task). Consolidated back onto the shared forms once both pieces of work
// had landed, which is what this file (and historyLogApi.ts) now does.
export function HistoryEditModal({ entry, onClose, onSaved }: HistoryEditModalProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        let view: ReadyView;
        if (entry.type === "mood") {
          const log = await fetchMoodLog(entry.id, entry.loggedAt);
          if (!log) throw new Error("Mood log not found");
          view = { kind: "mood", log };
        } else if (entry.type === "symptom") {
          const [log, symptoms] = await Promise.all([
            fetchSymptomLog(entry.id, entry.loggedAt),
            fetchSymptoms(),
          ]);
          if (!log) throw new Error("Symptom log not found");
          view = { kind: "symptom", log, symptoms };
        } else if (entry.type === "medication") {
          const log = await fetchMedicationLog(entry.id, entry.loggedAt);
          if (!log) throw new Error("Medication log not found");
          view = { kind: "medication", log };
        } else {
          const [log, categories] = await Promise.all([
            fetchCategoryLog(entry.id, entry.loggedAt),
            fetchCategories(),
          ]);
          if (!log) throw new Error("Category log not found");
          view = { kind: "category", log, categories };
        }
        if (!cancelled) setState({ status: "ready", view });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <Modal open={!!entry} onClose={onClose} title={entry ? TYPE_TITLE[entry.type] : ""}>
      {state.status === "loading" && <p className="text-text-muted">Loading…</p>}
      {state.status === "error" && (
        <div>
          <p role="alert" className="text-danger">
            Couldn&apos;t load this entry. Please try again.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
      {state.status === "ready" && state.view.kind === "mood" && (
        <MoodEntryForm
          editingLog={state.view.log}
          onCancel={onClose}
          onSaved={(log) =>
            onSaved({
              id: log.id,
              type: "mood",
              label: moodLabel(log),
              notes: log.notes,
              loggedAt: log.loggedAt,
            })
          }
        />
      )}
      {state.status === "ready" && state.view.kind === "symptom" && (
        <SymptomEntryForm
          editingLog={state.view.log}
          symptoms={state.view.symptoms}
          onCancel={onClose}
          onSymptomCreated={(symptom) =>
            setState((prev) =>
              prev.status === "ready" && prev.view.kind === "symptom"
                ? { ...prev, view: { ...prev.view, symptoms: [...prev.view.symptoms, symptom] } }
                : prev,
            )
          }
          onSaved={(log) => {
            const symptomName =
              state.view.kind === "symptom"
                ? (state.view.symptoms.find((s) => s.id === log.symptomId)?.name ?? "Symptom")
                : "Symptom";
            onSaved({
              id: log.id,
              type: "symptom",
              label: symptomLabel(symptomName, log.severity),
              notes: log.notes,
              loggedAt: log.loggedAt,
            });
          }}
        />
      )}
      {state.status === "ready" && state.view.kind === "medication" && (
        <MedicationEntryForm
          editingLog={state.view.log}
          onCancel={onClose}
          onSaved={(log, medication) =>
            onSaved({
              id: log.id,
              type: "medication",
              label: medicationLabel(medication.name, medication.dosage, log.taken),
              notes: log.notes,
              loggedAt: log.loggedAt,
            })
          }
        />
      )}
      {state.status === "ready" && state.view.kind === "category" && (
        <CategoryEntryForm
          editingLog={state.view.log}
          categories={state.view.categories}
          onCancel={onClose}
          // This is always an edit here, so CategoryEntryForm's own "+ Add a new category" escape
          // hatch never renders - the callback is required by the prop type but never invoked.
          onAddCategory={() => {}}
          onSaved={(log) => {
            const category =
              state.view.kind === "category"
                ? state.view.categories.find((c) => c.id === log.categoryId)
                : undefined;
            onSaved({
              id: log.id,
              type: "category",
              label: categoryLabel(category?.name ?? "Category", log, {
                valueType: category?.valueType ?? "numeric",
                scaleMax: category?.scaleMax ?? null,
              }),
              notes: log.notes,
              loggedAt: log.loggedAt,
            });
          }}
        />
      )}
    </Modal>
  );
}
