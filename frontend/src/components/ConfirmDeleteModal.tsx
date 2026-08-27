import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmDeleteModalProps {
  // null means "closed" - mirrors HistoryEditModal's identical convention.
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// A shared confirmation dialog for any delete action in this app, replacing the native
// window.confirm() both History and Settings' own Categories list used to call directly - a real
// dialog built from this app's own Modal component instead, so it matches the app's visual
// language (rounded card, focus trap, Escape/backdrop dismissal) rather than dropping the user
// into a native browser popup that looks nothing like the rest of the product. Originally built
// for History's own entry-delete flow, then promoted here (out of pages/history/) once Settings'
// category delete confirmation (see docs/log/22-category-soft-delete-with-undo.md) needed the
// exact same shape - matching this project's own established pattern of pulling a component out
// once it's proven itself in a second, independent place (see e.g. RatingScale.tsx's own comment
// on the same kind of promotion).
//
// Both actions default to Button's "primary"/"secondary" pairing (the same pairing every save
// form in this app uses for its own submit/cancel), not "danger" - see Button.tsx's own comment
// on why that variant is deliberately reserved for harder-to-undo actions. A single log entry can
// always just be re-logged; a category delete now has its own 30-day undo window (see the
// category delete flow), so neither caller currently needs "danger" - `message` is what actually
// carries the real stakes of a given delete to the reader, not the button's own color.
export function ConfirmDeleteModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-text">{message}</p>
      <div className="mt-4 flex gap-3">
        <Button type="button" onClick={onConfirm}>
          Delete
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
