import type { ComponentProps } from "react";
import { Button } from "./Button";

// A row action that shows an icon on narrow screens and its short text label from `sm:` up.
//
// The point that makes this safe rather than a downgrade: **the accessible name never changes.**
// It is always `name` (or `label` when that is already unambiguous), so screen readers, keyboard
// users and every existing test address the button identically at any viewport - only the
// *visible* content swaps. Shipping an icon-only button with no accessible name is one of the most
// common accessibility regressions there is, so the icon is explicitly `aria-hidden` and the name
// is never derived from it.
//
// `name` exists separately from `label` because the two genuinely differ: a History row's button
// should read "Edit" on screen but announce "Edit entry from 29/08/2026, 09:15" - a list of
// identically-named buttons is useless to anyone navigating by name.
//
// Why `sm:` (640px) and not the `md:` this app uses elsewhere: `md:` is where the whole navigation
// *mode* changes (bottom tab bar to top bar - see BottomNav.tsx). This is a much narrower question
// - whether a row has room for a word or two beside a name - and that room appears well before
// 768px. See docs/log/28-responsive-icon-actions.md.
interface ActionButtonProps extends Omit<ComponentProps<typeof Button>, "children" | "aria-label"> {
  // Shown alone on narrow screens. Decorative only - never the accessible name.
  icon: string;
  // The visible text from `sm:` up. Short: it has to sit in a row beside other actions.
  label: string;
  // The accessible name at every width. Defaults to `label` when that already identifies the
  // button on its own.
  name?: string;
}

export function ActionButton({ icon, label, name, ...props }: ActionButtonProps) {
  return (
    <Button aria-label={name ?? label} {...props}>
      <span aria-hidden="true" className="sm:hidden">
        {icon}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
