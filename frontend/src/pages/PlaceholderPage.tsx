import { NavBar } from "../components/NavBar";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-text">{title}</h1>
        <p className="mt-2 text-text-muted">Coming in a later phase.</p>
      </main>
    </div>
  );
}
