import { useAuth } from "../auth/AuthContext";
import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";
import { DashboardSummary } from "../components/dashboard/DashboardSummary";
import { CategorySection } from "../components/dashboard/CategorySection";
import { QuickAddFab } from "../components/dashboard/QuickAddFab";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      {/* max-w-3xl on mobile matches every other page (a comfortable single-column reading
          width); md:max-w-5xl only kicks in once there's actually a 2-column grid below to use
          the extra room for - see the implementation log entry on this app's mobile-first pass
          for why Dashboard/Trends widen like this but History/Settings/auth pages don't.
          pb-24 (instead of the plain py-8 every other side uses) leaves room for the fixed
          BottomNav bar below `md:`, so the last panel in the grid isn't hidden behind it;
          md:pb-8 reverts to the normal, symmetric padding once `md:` hides BottomNav. */}
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-24 md:max-w-5xl md:pb-8">
        <h1 className="text-2xl font-semibold text-text">Welcome, {user?.displayName}</h1>
        <p className="mt-2 text-text-muted">You&apos;re logged in as {user?.email}.</p>

        <div className="mt-8">
          <DashboardSummary />
        </div>

        {/* One column on mobile (screen width is the scarce resource - see the implementation
            log entry), two from md: (768px) up once there's enough width for a second column
            without cramping either one. Mood, Habit, Symptom, and Medication each had their own
            toggle/section here too until Phase 17 and Phase 19 folded all four into Category (see
            docs/log/17-unify-mood-symptom-habit.md and docs/log/19-medication-to-category.md) -
            every one of them is an ordinary category now (personal or system), rendered entirely
            through CategorySection's own per-category cards below - no fixed built-in section is
            left to gate on a toggle. History deliberately isn't gated the same way - browsing past
            data is a different concern from "can I log a new one" (see
            docs/log/16-reminders-and-category-toggles.md's Task 3 entry). */}
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <CategorySection />
        </div>
      </main>
      <BottomNav centerAction={<QuickAddFab />} />
    </div>
  );
}
