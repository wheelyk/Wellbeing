import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { NavBar } from "../components/NavBar";
import { BottomNav } from "../components/BottomNav";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { PeriodSelector, type TrendsPeriod } from "../components/trends/PeriodSelector";
import { TrendLineChart, type TrendPoint } from "../components/trends/TrendLineChart";
import { ActivityCalendar, type ActivityDay } from "../components/trends/ActivityCalendar";

interface CategoryTrend {
  categoryId: string;
  name: string;
  icon: string | null;
  valueType: "numeric" | "scale";
  scaleMin: number | null;
  scaleMax: number | null;
  series: TrendPoint[];
  average: number | null;
}

interface TrendsData {
  period: TrendsPeriod;
  startDate: string;
  endDate: string;
  days: string[];
  symptomSeverity: { series: TrendPoint[]; average: number | null };
  mood: { series: TrendPoint[]; average: number | null };
  categoryTrends: CategoryTrend[];
  activity: { days: ActivityDay[] };
}

const PERIOD_LABELS: Record<TrendsPeriod, string> = {
  "7d": "the last 7 days",
  "30d": "the last 30 days",
  "90d": "the last 90 days",
};

// These hex values mirror index.css's `--color-brand` / `--color-brand-dark` theme tokens - SVG
// `fill`/`stroke` attributes (used inside TrendLineChart) don't accept Tailwind utility classes,
// so the two charts on this page pass the same colors as plain hex rather than duplicating a
// third source of truth for them.
const SYMPTOM_CHART_COLOR = "#2563eb";
const MOOD_CHART_COLOR = "#1d4ed8";

// A small rotating palette for however many numeric/scale custom categories a user has - unlike
// symptom/mood's own two fixed colors, this has to cover an unbounded number of charts; colors
// repeat if there are more categories than swatches, which is an acceptable tradeoff for a
// personal trends page rather than adding a full color-generation scheme.
const CATEGORY_CHART_COLORS = ["#0d9488", "#c026d3", "#ea580c", "#4338ca", "#65a30d", "#be123c"];

// A "scale" category already has a real bound (its own scaleMin/scaleMax, used directly - see
// the render below); a "numeric" one doesn't, so its domain is derived from the data itself
// instead of a fixed range that might clip real values or waste most of the chart on an unused
// range no one's data ever reaches.
function numericDomain(series: TrendPoint[]): [number, number] {
  const values = series
    .map((point) => point.average)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return [0, 10];
  const max = Math.max(...values);
  return [0, Math.max(1, Math.ceil(max * 1.2))];
}

export function TrendsPage() {
  const [period, setPeriod] = useState<TrendsPeriod>("7d");
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiFetch<TrendsData>(`/api/trends?period=${period}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="min-h-screen bg-surface-muted">
      <NavBar />
      {/* max-w-3xl on mobile, matching every other page; lg:max-w-5xl only once the two line
          charts below actually sit side by side - see the implementation log entry on this
          app's mobile-first pass. The switch to 2-column happens at lg:, not md:, since a line
          chart genuinely needs real width to stay readable - unlike Dashboard's panels (mostly
          text), squeezing these into a tablet-width column too early would make the trend lines
          themselves harder to read, not just visually tighter.
          pb-24/md:pb-8 - see DashboardPage.tsx's equivalent comment: leaves room below `md:` for
          the fixed BottomNav bar so the Activity calendar's bottom edge isn't hidden behind it. */}
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-24 lg:max-w-5xl md:pb-8">
        <h1 className="text-2xl font-semibold text-text">Trends</h1>
        {/* Explicit descriptive-not-diagnostic framing, per requirements §10/§14 ("must avoid
            claiming that one factor causes another" / "must not present itself as a medical
            diagnostic system") - stated once here up top rather than repeated on every chart. */}
        <p className="mt-2 text-text-muted">
          A descriptive look at what you&apos;ve logged over time — not a diagnosis, and not a claim
          about what&apos;s causing what.
        </p>

        <div className="mt-6">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        {loading && <p className="mt-6 text-text-muted">Loading your trends…</p>}

        {!loading && loadError && (
          <p role="alert" className="mt-6 text-danger">
            Couldn&apos;t load your trends. Please try refreshing.
          </p>
        )}

        {!loading && !loadError && data && (
          <>
            {/* Single column until lg: (see the main container's own comment above for why
                these two charts specifically wait for lg: rather than md:). */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <CollapsibleSection
                  storageKey="trends.symptomSeverity"
                  title={
                    <>
                      Symptom Severity —{" "}
                      {data.symptomSeverity.average !== null
                        ? `Avg: ${data.symptomSeverity.average.toFixed(1)}`
                        : "No data yet"}
                    </>
                  }
                >
                  <p className="text-sm text-text-muted">
                    Logged severity (1–10) over {PERIOD_LABELS[period]}.
                  </p>
                  <TrendLineChart
                    points={data.symptomSeverity.series}
                    domainMin={1}
                    domainMax={10}
                    color={SYMPTOM_CHART_COLOR}
                    formatValue={(value) => `${value.toFixed(1)}/10`}
                    ariaLabel={`Symptom severity chart for ${PERIOD_LABELS[period]}`}
                  />
                </CollapsibleSection>
              </section>

              <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <CollapsibleSection
                  storageKey="trends.mood"
                  title={
                    <>
                      Mood —{" "}
                      {data.mood.average !== null
                        ? `Avg: ${data.mood.average.toFixed(1)}`
                        : "No data yet"}
                    </>
                  }
                >
                  <p className="text-sm text-text-muted">
                    Logged mood (1–5) over {PERIOD_LABELS[period]}.
                  </p>
                  <TrendLineChart
                    points={data.mood.series}
                    domainMin={1}
                    domainMax={5}
                    color={MOOD_CHART_COLOR}
                    formatValue={(value) => `${value.toFixed(1)}/5`}
                    ariaLabel={`Mood chart for ${PERIOD_LABELS[period]}`}
                  />
                </CollapsibleSection>
              </section>

              {data.categoryTrends.map((trend, index) => {
                const [domainMin, domainMax] =
                  trend.valueType === "scale"
                    ? [trend.scaleMin ?? 0, trend.scaleMax ?? 10]
                    : numericDomain(trend.series);
                const color = CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length];
                return (
                  <section
                    key={trend.categoryId}
                    className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
                  >
                    <CollapsibleSection
                      storageKey={`trends.category.${trend.categoryId}`}
                      title={
                        <>
                          {trend.icon ? `${trend.icon} ` : ""}
                          {trend.name} —{" "}
                          {trend.average !== null
                            ? `Avg: ${trend.average.toFixed(1)}`
                            : "No data yet"}
                        </>
                      }
                    >
                      <p className="text-sm text-text-muted">
                        Logged{" "}
                        {trend.valueType === "scale"
                          ? `${trend.scaleMin}–${trend.scaleMax}`
                          : "values"}{" "}
                        over {PERIOD_LABELS[period]}.
                      </p>
                      <TrendLineChart
                        points={trend.series}
                        domainMin={domainMin}
                        domainMax={domainMax}
                        color={color}
                        formatValue={(value) =>
                          trend.valueType === "scale"
                            ? `${value.toFixed(1)}/${trend.scaleMax}`
                            : value.toFixed(1)
                        }
                        ariaLabel={`${trend.name} chart for ${PERIOD_LABELS[period]}`}
                      />
                    </CollapsibleSection>
                  </section>
                );
              })}
            </div>

            {/* Stays full-width at every size, deliberately not part of the grid above - a
                7-column weekly activity calendar reads better wide than squeezed into half a
                desktop-width row, unlike the two line charts. */}
            <section className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <CollapsibleSection storageKey="trends.activity" title="Activity">
                <p className="text-sm text-text-muted">
                  Days with any logged entry (symptoms, mood, medications, habits, or a custom
                  category) over {PERIOD_LABELS[period]}.
                </p>
                <ActivityCalendar days={data.activity.days} />
              </CollapsibleSection>
            </section>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
