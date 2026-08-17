import { useAuth } from "../auth/AuthContext";
import { NavBar } from "../components/NavBar";
import { MoodSection } from "../components/dashboard/MoodSection";
import { HabitSection } from "../components/dashboard/HabitSection";
import { MedicationSection } from "../components/dashboard/MedicationSection";
import { SymptomSection } from "../components/dashboard/SymptomSection";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-text">Welcome, {user?.displayName}</h1>
        <p className="mt-2 text-text-muted">
          You&apos;re logged in as {user?.email}. The full dashboard (today&apos;s summary, streak)
          is built in a later phase — all four log types (mood, symptoms, medications, habits) are
          wired up here.
        </p>

        <MoodSection />
        <HabitSection />
        <MedicationSection />
        <SymptomSection />
      </main>
    </div>
  );
}
