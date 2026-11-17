interface Point {
  x: number;
  y: number;
  payload: { id: string; total: number; isRetest?: boolean };
}

interface Props {
  formattedGraphicalItems?: { props: { points?: Point[] } }[];
  isDark: boolean;
  /** Kept for callers; every label now sits above its point so the ceiling no longer changes placement. */
  ceiling?: number;
  /** Phones have no first-attempt filter, so retakes are drawn as hollow grey points instead. */
  markRetests?: boolean;
}

/** Recharts suppresses Area dots during animation; draw the final labels independently. */
export function OverviewChartLabels({ formattedGraphicalItems, isDark, markRetests = false }: Props) {
  const points = formattedGraphicalItems?.[0]?.props.points ?? [];
  return <g className="overview-chart-labels" pointerEvents="none" aria-hidden="true">
    {points.map(({ x, y, payload }, index) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const isLast = index === points.length - 1;
      const retest = markRetests && payload.isRetest;
      const grey = isDark ? '#64748B' : '#94A3B8';
      // One rule for every point: the score sits just above it. The halo keeps it readable where it crosses a line.
      return <g key={payload.id} data-retest={retest || undefined}>
        <text x={x} y={y - (isLast ? 18 : 16)} textAnchor="middle" fontSize={13} fontWeight={800} fontFamily="Plus Jakarta Sans, sans-serif" fill={retest ? grey : isDark ? '#F1F5F9' : '#0F172A'}
          stroke={isDark ? '#111A2C' : '#FFFFFF'} strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">{payload.total}</text>
        {retest
          ? <circle cx={x} cy={y} r={isLast ? 5.5 : 4} fill={isDark ? '#0F172A' : '#FFFFFF'} stroke={grey} strokeWidth={2} />
          : <circle cx={x} cy={y} r={isLast ? 9 : 6.5} fill={isLast ? '#F59E0B' : isDark ? '#0F172A' : '#FFFFFF'} stroke={isDark ? '#E2E8F0' : '#0F172A'} strokeWidth={3} />}
      </g>;
    })}
  </g>;
}
