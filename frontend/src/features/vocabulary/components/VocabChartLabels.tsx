interface BarBox { x: number; y: number; width: number; payload: { date: string; count: number } }
interface Props { formattedGraphicalItems?: { props: { data?: BarBox[] } }[]; isDark: boolean }

/** Labels use target geometry rather than Recharts' temporarily animated rectangles. */
export function VocabChartLabels({ formattedGraphicalItems, isDark }: Props) {
  const boxes = (formattedGraphicalItems?.[0]?.props.data ?? []).filter(box => Number.isFinite(box.x) && Number.isFinite(box.y));
  const chosen: BarBox[] = [];
  for (const box of [...boxes].reverse()) {
    const center = box.x + box.width / 2;
    const size = String(box.payload.count).length * 7 + 6;
    if (chosen.every(other => Math.abs(other.x + other.width / 2 - center) > (size + String(other.payload.count).length * 7 + 6) / 2)) chosen.push(box);
  }
  return <g className="vocab-chart-labels" pointerEvents="none" aria-hidden="true">{chosen.map(box => (
    <text key={box.payload.date} x={box.x + box.width / 2} y={box.y - 7} textAnchor="middle" fill={isDark ? '#f1f5f9' : '#0f172a'} fontSize={12} fontWeight={700}>{box.payload.count}</text>
  ))}</g>;
}
