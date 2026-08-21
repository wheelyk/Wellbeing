import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

interface ConfirmDeleteModalProps {
  // null means "closed" - mirrors HistoryEditModal's identical convention.
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Replaces the native window.confirm() this page used to call directly for its delete action -
// a real dialog built from this app's own Modal component instead, so it matches the app's
// visual language (rounded card, focus trap, Escape/backdrop dismissal) rather than dropping the
// user into a native browser popup that looks nothing like the rest of the product.
//
// Both actions default to Button's "primary"/"secondary" pairing (the same pairing every save
// form in this app uses for its own submit/cancel), not "danger" - see Button.tsx's own comment
// on why that variant is deliberately reserved for harder-to-undo actions than a single log
// entry, which can always just be re-logged.
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
