/** Display existing prose in readable lines without rewriting the saved explanation. */
export function analysisLines(value: string): string[] {
  const explicit = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (explicit.length > 1) return explicit;
  if (!value.trim()) return [];
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale: string, options: { granularity: 'sentence' }) => {
      segment(text: string): Iterable<{ segment: string }>;
    };
  }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter('vi', { granularity: 'sentence' }).segment(value), item => item.segment.trim()).filter(Boolean);
  }
  return explicit;
}
