import { findMatchingSegment, findSecondarySegment, type HeaderSegment } from './parserAlgorithm';
import { containsSiman, type SourceProfile } from './halachaAlgorithm';

/** A siman choice includes its seif subheadings, like the automatic parser's search range. */
export function manualSegmentRanges(segments: HeaderSegment[], profile?: SourceProfile): HeaderSegment[] {
  if (profile?.kind !== 'halacha') return segments;
  return segments.map(segment => containsSiman(segment.headerTitle)
    ? findSecondarySegment(segments, segment.headerTitle, profile, segment.headerTitle)! : segment);
}

export function manualMatchingSegment(segments: HeaderSegment[], commentary: HeaderSegment[],
  line: number, profile?: SourceProfile): HeaderSegment | null {
  const index = commentary.findIndex(segment => line >= segment.startLine && line <= segment.endLine);
  if (index < 0) return null;
  if (profile?.kind !== 'halacha') return findMatchingSegment(segments, commentary[index].headerTitle) ?? null;
  let siman: string | undefined;
  for (let i = 0; i <= index; i++) {
    if (containsSiman(commentary[i].headerTitle)) siman = commentary[i].headerTitle;
  }
  return findSecondarySegment(segments, commentary[index].headerTitle, profile, siman);
}
