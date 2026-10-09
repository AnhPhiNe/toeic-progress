interface Point {
  x: number;
  y: number;
  payload: { id: string; total: number };
}

interface Props {
  formattedGraphicalItems?: { props: { points?: Point[] } }[];
  isDark: boolean;
  ceiling: number;
}

/** Recharts suppresses Area dots during animation; draw the final labels independently. */
export function OverviewChartLabels({ formattedGraphicalItems, isDark, ceiling }: Props) {
  const points = formattedGraphicalItems?.[0]?.props.points ?? [];
  return <g className="overview-chart-labels" pointerEvents="none" aria-hidden="true">
    {points.map(({ x, y, payload }, index) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const isLast = index === points.length - 1;
      return <g key={payload.id}>
        <text x={x} y={ceiling - payload.total <= 20 ? y + 18 : y - 12} textAnchor="middle" fontSize={12} fontWeight={800} fontFamily="Plus Jakarta Sans, sans-serif" fill={isDark ? '#F1F5F9' : '#0F172A'}>{payload.total}</text>
        <circle cx={x} cy={y} r={isLast ? 6 : 4} fill={isLast ? '#2563EB' : isDark ? '#0F172A' : '#FFFFFF'} stroke={isLast ? (isDark ? '#93C5FD' : '#0F172A') : '#2563EB'} strokeWidth={2} />
      </g>;
    })}
  </g>;
}
