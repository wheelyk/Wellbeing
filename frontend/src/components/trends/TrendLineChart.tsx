import { useState } from "react";

export interface TrendPoint {
  date: string;
  average: number | null;
  count: number;
}

interface TrendLineChartProps {
  points: TrendPoint[];
  domainMin: number;
  domainMax: number;
  /** A CSS color value (hex, not a Tailwind class) - SVG `fill`/`stroke` attributes don't accept
   *  Tailwind utility classes, so the caller passes the same hex value index.css's `--color-brand`
   *  / `--color-brand-dark` tokens resolve to. */
  color: string;
  formatValue: (value: number) => string;
  ariaLabel: string;
}

// No charting library is installed in this project (see this task's implementation-log entry for
// the reasoning) - this is a small hand-rolled SVG line chart instead, sized to a fixed logical
// viewBox and stretched to the container's actual width via `preserveAspectRatio="none"`, which
// is what lets the percentage-based tooltip positioning below line up correctly with the SVG's
// own coordinate system regardless of the rendered pixel size.
const CHART_WIDTH = 600;
const CHART_HEIGHT = 140;
const LABEL_HEIGHT = 28;
const TOTAL_HEIGHT = CHART_HEIGHT + LABEL_HEIGHT;
// Padding inside the plot area so a point sitting exactly at domainMin/domainMax doesn't render
// its marker clipped against the chart's top/bottom edge.
const VERTICAL_PADDING = 8;
// Same idea horizontally - without it, the first and last day's marker sits with its center
// exactly on x=0 or x=CHART_WIDTH, clipping half the circle off the visible chart (caught during
// this task's own real-browser verification, not visible in the component tests, which don't
// render actual pixel geometry).
const HORIZONTAL_PADDING = 8;
// Below this many real (non-null) data points, a connecting line doesn't show a "trend" - it shows
// one or two dots joined by a line that looks more confident than the data supports. See the
// `isSparse` comment below for the full reasoning.
const SPARSE_DATA_THRESHOLD = 3;

function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function xFor(index: number, count: number): number {
  if (count <= 1) return CHART_WIDTH / 2;
  const usable = CHART_WIDTH - HORIZONTAL_PADDING * 2;
  return HORIZONTAL_PADDING + (index / (count - 1)) * usable;
}

function yFor(value: number, domainMin: number, domainMax: number): number {
  const clamped = Math.min(Math.max(value, domainMin), domainMax);
  const ratio = (clamped - domainMin) / (domainMax - domainMin || 1);
  const usable = CHART_HEIGHT - VERTICAL_PADDING * 2;
  // Inverted: a higher value should sit higher on the chart (a smaller y, since SVG y grows
  // downward), so the ratio is flipped before scaling into the usable pixel range.
  return VERTICAL_PADDING + (1 - ratio) * usable;
}

// Descriptive only, per requirements §10/§14 - "logged severity," never a claim about trend
// direction or cause. This label is what a screen reader announces for the whole chart; the
// per-point detail (below) covers the individual values.
export function TrendLineChart({
  points,
  domainMin,
  domainMax,
  color,
  formatValue,
  ariaLabel,
}: TrendLineChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const realPointCount = points.filter((point) => point.average !== null).length;
  const hasAnyData = realPointCount > 0;

  if (!hasAnyData) {
    return <p className="mt-4 text-text-muted">Not enough data yet for this period.</p>;
  }

  // Between "zero real points" (the empty state above) and a real trend line sits a state this
  // component used to render identically to a full chart: the same full-width canvas, but with
  // only one or two real dots (often pinned near one edge, wherever they happened to fall in the
  // period) surrounded by a large area of empty, unlabeled space. In a UI review that read as
  // "something failed to load," not as an expected early state. Below SPARSE_DATA_THRESHOLD real
  // points, this renders a distinct treatment instead: the real point(s) stay fully visible (never
  // hidden), but the solid connecting trend line - which would otherwise draw unearned confidence
  // from just one or two dots - is replaced with a faint dashed placeholder line plus an explicit
  // caption, so the state reads as "log more days to see a trend here," not "broken."
  const isSparse = realPointCount < SPARSE_DATA_THRESHOLD;

  // The line breaks at any day with no entry rather than interpolating across the gap - a
  // straight line drawn between two real, several-days-apart readings would visually imply a
  // trend on days nothing was actually logged, which is exactly the kind of unsupported claim
  // requirements §10/§14 rule out.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  points.forEach((point, index) => {
    if (point.average === null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      return;
    }
    current.push({ x: xFor(index, points.length), y: yFor(point.average, domainMin, domainMax) });
  });
  if (current.length > 0) segments.push(current);

  const pathData = segments
    .map((segment) => `M ${segment.map((p) => `${p.x},${p.y}`).join(" L ")}`)
    .join(" ");

  const hovered = hoveredIndex !== null ? points[hoveredIndex] : null;
  const hitWidth = points.length > 0 ? CHART_WIDTH / points.length : CHART_WIDTH;

  // Only the first, middle, and last day get an x-axis label, regardless of period length - with
  // up to 90 points, labeling every single day would be unreadable overlapping text; this still
  // orients the viewer to the period's start/middle/end.
  const labelIndexes = new Set<number>(
    points.length <= 1 ? [0] : [0, Math.floor((points.length - 1) / 2), points.length - 1],
  );

  return (
    <div className="relative mt-4" role="group" aria-label={ariaLabel}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${TOTAL_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-[180px] w-full"
      >
        {/* Everything below except the hit-target rects (further down) is purely decorative -
            marked aria-hidden individually rather than hiding the whole <svg>, since that would
            also remove the accessible, keyboard-focusable hit targets from the accessibility
            tree (aria-hidden on an ancestor hides all descendants, including ones that are
            themselves interactive/focusable - a real accessibility bug caught by this file's own
            tests, not just a styling choice). */}
        {/* Recessive top/bottom gridlines marking the domain's max/min - deliberately faint
            (the app's own --color-border token) so they orient the eye without competing with
            the data line itself. */}
        <line
          aria-hidden="true"
          x1={0}
          y1={VERTICAL_PADDING}
          x2={CHART_WIDTH}
          y2={VERTICAL_PADDING}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        <line
          aria-hidden="true"
          x1={0}
          y1={CHART_HEIGHT - VERTICAL_PADDING}
          x2={CHART_WIDTH}
          y2={CHART_HEIGHT - VERTICAL_PADDING}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {isSparse ? (
          // A faint dashed placeholder standing in for the trend line that isn't earned yet -
          // deliberately not drawn through/between the real point(s) (that would just be a solid
          // line renamed dashed, still implying a trend from one or two dots). It runs across the
          // chart's vertical center as a neutral "a line will appear here" cue.
          <line
            aria-hidden="true"
            x1={HORIZONTAL_PADDING}
            y1={CHART_HEIGHT / 2}
            x2={CHART_WIDTH - HORIZONTAL_PADDING}
            y2={CHART_HEIGHT / 2}
            stroke="var(--color-border)"
            strokeWidth={2}
            strokeDasharray="6 6"
          />
        ) : (
          <path
            aria-hidden="true"
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {points.map((point, index) =>
          point.average === null ? null : (
            <circle
              key={point.date}
              aria-hidden="true"
              cx={xFor(index, points.length)}
              cy={yFor(point.average, domainMin, domainMax)}
              r={4}
              fill={color}
            />
          ),
        )}

        {points.map((point, index) =>
          labelIndexes.has(index) ? (
            <text
              key={`label-${point.date}`}
              aria-hidden="true"
              x={xFor(index, points.length)}
              y={TOTAL_HEIGHT - 8}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              style={{ fill: "var(--color-text-muted)", fontSize: 10 }}
            >
              {formatShortDate(point.date)}
            </text>
          ) : null,
        )}

        {/* One invisible, keyboard-focusable hit target per day, wider than the 8px-diameter
            visual marker it sits over - "hit targets bigger than the mark" - so hovering or
            tabbing near a point (not just exactly on its 4px-radius circle) reveals its tooltip.
            Days with no entry still get a hit target, announcing "No data logged" rather than
            silently doing nothing. */}
        {points.map((point, index) => (
          <rect
            key={`hit-${point.date}`}
            x={xFor(index, points.length) - hitWidth / 2}
            y={0}
            width={hitWidth}
            height={CHART_HEIGHT}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${formatShortDate(point.date)}: ${
              point.average !== null ? formatValue(point.average) : "No data logged"
            }`}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onFocus={() => setHoveredIndex(index)}
            onBlur={() => setHoveredIndex(null)}
          />
        ))}
      </svg>

      {hovered && hoveredIndex !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-2 py-1 text-xs whitespace-nowrap text-text shadow-md"
          style={{
            left: `${(xFor(hoveredIndex, points.length) / CHART_WIDTH) * 100}%`,
            top: `${
              (yFor(hovered.average ?? domainMin, domainMin, domainMax) / TOTAL_HEIGHT) * 100
            }%`,
          }}
        >
          {`${formatShortDate(hovered.date)}: ${
            hovered.average !== null ? formatValue(hovered.average) : "No data logged"
          }`}
        </div>
      )}

      {isSparse && (
        <p className="mt-1 text-xs text-text-muted">Keep logging to see a trend line here.</p>
      )}
    </div>
  );
}
