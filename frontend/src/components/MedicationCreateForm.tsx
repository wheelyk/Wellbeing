import { useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import { Button } from "./Button";
import { TextField } from "./TextField";
import type { Medication } from "./MedicationEntryForm";

interface MedicationCreateFormProps {
  onCreated: (medication: Medication) => void;
  onCancel: () => void;
}

// A small, focused "define a medication" form for Settings' own Medications section - the same
// role CategoryCreateForm plays for categories, just simpler (name plus an optional dosage,
// no value-type picker) since Medication has no equivalent of Category's valueType.
// MedicationEntryForm already has its own inline version of this same create flow (for adding a
// medication while logging a dose), but that one hands its result back via a very different
// onSaved(log, medication) shape - a standalone name+dosage-only form was simpler to write here
// than trying to make one component serve both call sites.
export function MedicationCreateForm({ onCreated, onCancel }: MedicationCreateFormProps) {
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setNameError("Give this medication a name.");
      return;
    }
    setNameError(null);

    setSubmitting(true);
    try {
      const medication = await apiFetch<Medication>("/api/medications", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), dosage: dosage.trim() || undefined }),
      });
      onCreated(medication);
    } catch {
      setFormError("Something went wrong adding your medication. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <TextField
        label="Medication name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError ?? undefined}
        placeholder="e.g. Diazepam"
      />
      <TextField
        label="Dosage (optional)"
        value={dosage}
        onChange={(e) => setDosage(e.target.value)}
        placeholder="e.g. 2mg"
      />
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add medication"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
