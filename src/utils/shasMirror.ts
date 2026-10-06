import { SHAS_MIRROR_TABLE } from '../data/shasMirrorTable';
import { HALACHA_MIRROR_TABLE } from '../data/halachaMirrorTable';

/**
 * ── The mirror: the gemara line behind a רש"י/תוספות link ─────────────────────────────
 *
 * A link whose target is רש"י or תוספות points at a line in THAT book — `line_index_2` is a
 * Rashi line, not a gemara line (see parserAlgorithm's assignment at the explicit-secondary
 * branch). The gemara line it hangs off is never computed by the engine and never shown in
 * the editor, but the export wants it: the same commentary line, linked a second time, to the
 * daf itself.
 *
 * That mapping is not something to re-derive by matching text — Otzaria's own library already
 * states it. It is extracted from the library database (scripts/extract-shas-commentary-links.mjs),
 * compacted into src/data/shasMirrorTable.ts, and read here.
 *
 * `library.getBookLinks` would be the live source for the same fact, and parserAlgorithm already
 * has a narrow consumer for it, but that host API does not exist yet — hence the baked table.
 *
 * Line numbers are 1-based on both sides, matching OtzariaLink. Tractate keys match
 * SHAS_TRACTATES exactly; the generator fails the build if that ever drifts.
 *
 * The same holds for a נושא כלים and its part of the שולחן ערוך (src/data/halachaMirrorTable.ts),
 * keyed by HALACHA_BOOKS and the SecondarySource ids.
 */

/** Decoded tables, per `${tractate}/${series}`. Decoding is ~10k slots and runs at most once. */
const decoded = new Map<string, Map<number, number> | null>();

/**
 * Comma-separated base36 deltas -> commentary line -> gemara line. An empty slot is a
 * commentary line with no link; a non-empty slot is the signed delta from the previous
 * emitted gemara line. See scripts/generate-shas-mirror.mjs for the encoder.
 */
function decode(encoded: string): Map<number, number> {
  const map = new Map<number, number>();
  const parts = encoded.split(',');
  let previous = 0;
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    const delta = parseInt(parts[i], 36);
    if (Number.isNaN(delta)) continue;
    previous += delta;
    map.set(i + 1, previous);
  }
  return map;
}

function tableFor(base: string, series: string): Map<number, number> | null {
  const cacheKey = `${base}/${series}`;
  const cached = decoded.get(cacheKey);
  if (cached !== undefined) return cached;

  const encoded = (SHAS_MIRROR_TABLE[base] as Record<string, string> | undefined)?.[series]
    ?? HALACHA_MIRROR_TABLE[base]?.[series];
  const table = encoded ? decode(encoded) : null;
  decoded.set(cacheKey, table);
  return table;
}

/** True when this book has any mirror data at all — no תנ"ך and no תמיד. */
export function hasMirrorData(base: string): boolean {
  const entry = SHAS_MIRROR_TABLE[base] ?? HALACHA_MIRROR_TABLE[base];
  return Boolean(entry && Object.values(entry).some(Boolean));
}

/**
 * The base line (gemara / שו"ע) a secondary line comments on, or undefined when the library
 * states no link for it. Callers should treat undefined as "no mirror row to emit", not as an
 * error: coverage is whatever Otzaria's own links cover.
 */
export function mirrorBaseLine(
  base: string,
  series: string,
  commentaryLine: number
): number | undefined {
  if (!commentaryLine || commentaryLine < 1) return undefined;
  return tableFor(base, series)?.get(commentaryLine);
}
