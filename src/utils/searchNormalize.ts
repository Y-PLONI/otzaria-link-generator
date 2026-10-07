// Real tags only, so a lone '<' in the text is kept.
const TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const ENTITY_RE = /&(quot|nbsp|amp|lt|gt|#39|apos);/g;
const ENTITIES: Record<string, string> = {
  quot: '"', nbsp: ' ', amp: '&', lt: '<', gt: '>', '#39': "'", apos: "'"
};
// Cantillation and vowel points, keeping the maqaf (־) and the sof pasuq / paseq marks.
const HEBREW_MARKS_RE = /[֑-ׇֽֿׁׂׅׄ]/g;
const INVISIBLE_RE = /[͏‎‏]/g;

/**
 * Text as free-text search compares it: no markup, no nikud or te'amim, gershayim/geresh as their
 * ASCII forms, a maqaf as a space, and whitespace collapsed. Applied to both the query and the text.
 */
export function normalizeForSearch(text: string): string {
  return text
    .replace(TAG_RE, ' ')
    .replace(ENTITY_RE, (_, name: string) => ENTITIES[name])
    // NFD splits the precomposed presentation forms (U+FB1D-FB4E) into letter + mark.
    .normalize('NFD')
    .replace(HEBREW_MARKS_RE, '')
    .replace(INVISIBLE_RE, '')
    .replace(/־/g, ' ')
    .replace(/״/g, '"')
    .replace(/׳/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
