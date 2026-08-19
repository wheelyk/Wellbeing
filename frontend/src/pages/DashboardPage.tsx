import { useAuth } from "../auth/AuthContext";
import { NavBar } from "../components/NavBar";
import { DashboardSummary } from "../components/dashboard/DashboardSummary";
import { MoodSection } from "../components/dashboard/MoodSection";
import { HabitSection } from "../components/dashboard/HabitSection";
import { MedicationSection } from "../components/dashboard/MedicationSection";
import { SymptomSection } from "../components/dashboard/SymptomSection";
import { QuickAddFab } from "../components/dashboard/QuickAddFab";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      {/* max-w-3xl on mobile matches every other page (a comfortable single-column reading
          width); md:max-w-5xl only kicks in once there's actually a 2-column grid below to use
          the extra room for - see the implementation log entry on this app's mobile-first pass
          for why Dashboard/Trends widen like this but History/Settings/auth pages don't. */}
      <main className="mx-auto max-w-3xl px-4 py-8 md:max-w-5xl">
        <h1 className="text-2xl font-semibold text-text">Welcome, {user?.displayName}</h1>
        <p className="mt-2 text-text-muted">You&apos;re logged in as {user?.email}.</p>

        <div className="mt-8">
          <DashboardSummary />
        </div>

        {/* One column on mobile (screen width is the scarce resource - see the implementation
            log entry), two from md: (768px) up once there's enough width for a second column
            without cramping either one. */}
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <MoodSection />
          <HabitSection />
          <MedicationSection />
          <SymptomSection />
        </div>
      </main>
      <QuickAddFab />
    </div>
  );
}
