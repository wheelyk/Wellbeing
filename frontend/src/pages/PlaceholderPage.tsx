import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      {/* pb-24/md:pb-8 - see DashboardPage.tsx's equivalent comment: leaves room below `md:` for
          the fixed BottomNav bar. */}
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-24 md:pb-8">
        <h1 className="text-2xl font-semibold text-text">{title}</h1>
        <p className="mt-2 text-text-muted">Coming in a later phase.</p>
      </main>
      <BottomNav />
    </div>
  );
}
