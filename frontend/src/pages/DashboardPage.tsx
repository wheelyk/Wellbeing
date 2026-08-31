import { useAuth } from "../auth/AuthContext";
import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";
import { DashboardSummary } from "../components/dashboard/DashboardSummary";
import { TimelinePanel } from "../components/dashboard/TimelinePanel";
import { CategoryLogger } from "../components/dashboard/CategoryLogger";
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
        {/* DashboardSummary is the page's own top frame again - date, identity, today's count,
            and the one "Log an entry for today" button every entry point on this page now shares
            (see docs/log/50-timeline-v2.md). It sat below Timeline for one task (docs/log/49); direct
            feedback moved it back above: a page's own "what day is it, who am I, how do I log
            something" frame reads better first, with the chronological detail underneath it. */}
        <div>
          <DashboardSummary displayName={user?.displayName} />
        </div>

        {/* "What did I log/miss and what's coming up" - chronological, right under the frame
            above. This is also now the *only* place logged/scheduled entries are browsed on this
            page: the per-category card list that used to sit below it is retired outright
            (docs/log/50-timeline-v2.md) - Timeline plus the summary's own logging button already
            cover what that list did, so showing every category again underneath would just repeat
            what Timeline already says. */}
        <div className="mt-6">
          <TimelinePanel />
        </div>
      </main>
      <BottomNav centerAction={<QuickAddFab />} />
      {/* Renders no visible chrome of its own - just the one shared "log a category" modal every
          trigger on this page opens (QuickAddFab's "+", DashboardSummary's button, and a tap on a
          Timeline row). See CategoryLogger's own comment for why this replaces CategorySection. */}
      <CategoryLogger />
    </div>
  );
}
