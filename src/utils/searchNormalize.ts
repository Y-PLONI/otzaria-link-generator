// Cantillation and vowel points, keeping the maqaf (־) and the sof pasuq / punctuation marks.
const HEBREW_MARKS_RE = /[֑-ׇֽֿׁׂׅׄ]/g;
const MAQAF_RE = /־/g;
const TAG_RE = /<[^>]*>/g;

/**
 * Text as free-text search compares it: no markup, no nikud or te'amim, and a maqaf counts as
 * the space it stands for. Applied to both the query and the searched text.
 */
export function normalizeForSearch(text: string): string {
  return text
    .replace(TAG_RE, '')
    .replace(HEBREW_MARKS_RE, '')
    .replace(MAQAF_RE, ' ')
    .toLowerCase();
}
