import { OtzariaLink, SessionState } from '../types';
import { secondaryLinesOf } from './parserAlgorithm';
import { mirrorBaseLine, hasMirrorData } from './shasMirror';
import { resolveSefariaRef, isSefariaOwnedTarget, titleOfPath } from './sefariaRefs';

/** One record of `<commentary>_links.json`, in the key order the library's files use. */
export interface LinkRecord {
  line_index_1: number;
  line_index_2: number;
  heRef_2: string;
  ref_2?: string;
  path_2: string;
  'Conection Type': 'source';
}

/**
 * The records of the `_links.json` file otzaria-library imports, named after the book that owns
 * line_index_1. "source" declares the target as this commentary's base; the library stores it as
 * base → commentary, so no reverse files are needed. A Sefaria-owned target must carry ref_2
 * (src/utils/sefariaRefs.ts), any other target must not; a link to a Sefaria-owned line with no
 * ref_2 is left out and counted in `misses` by its reason (any mirror row under `mirror`).
 * Duplicate records are dropped.
 */
export function buildLinkRecords(
  session: Pick<SessionState, 'links' | 'config' | 'sourceLines' | 'rashiLines' | 'tosafotLines' | 'secondaryLines'>
): { records: LinkRecord[]; misses: { header: number; changed: number; unaddressed: number; mirror: number } } {
  const misses = { header: 0, changed: 0, unaddressed: 0, mirror: 0 };
  const linkRecord = (lineIndex1: number, lineIndex2: number, heRef2: string, path2: string, targetLines?: string[], isMirror = false): LinkRecord | null => {
    const title = titleOfPath(path2);
    if (!isSefariaOwnedTarget(title)) {
      return { line_index_1: lineIndex1, line_index_2: lineIndex2, heRef_2: heRef2, path_2: path2, 'Conection Type': 'source' };
    }
    const sefaria = resolveSefariaRef(title, lineIndex2, targetLines);
    if (typeof sefaria === 'string') {
      misses[isMirror ? 'mirror' : sefaria]++;
      return null;
    }
    return {
      line_index_1: lineIndex1,
      line_index_2: lineIndex2,
      heRef_2: sefaria.heRef,
      ref_2: sefaria.ref,
      path_2: path2,
      'Conection Type': 'source'
    };
  };

  const targetLinesOf = (link: OtzariaLink) =>
    link.secondaryTarget ? secondaryLinesOf(session, link.secondaryTarget) : session.sourceLines;

  // Mirror row — a commentary line that links to a secondary book (רש"י/תוספות, a נושא כלים) also
  // hangs off the base line that comment is on. The engine never computes it; it is Otzaria's own
  // library link, baked into src/data/shasMirrorTable.ts / halachaMirrorTable.ts. For a secondary
  // link line_index_2 is a line in the secondary book, which is exactly what the tables are keyed by.
  const base = session.config.targetBookName;
  const withMirror = hasMirrorData(base);
  const mirrorRecord = (link: OtzariaLink) => {
    if (!withMirror || !link.secondaryTarget) return null;
    // Coverage is whatever the library's own links cover — a miss is a row to skip.
    const baseLine = mirrorBaseLine(base, link.secondaryTarget, link.line_index_2);
    return baseLine ? linkRecord(link.line_index_1, baseLine, base, `${base}.txt`, session.sourceLines, true) : null;
  };

  const seen = new Set<string>();
  const records = session.links
    .flatMap(link => [
      linkRecord(link.line_index_1, link.line_index_2, link.heRef_2, link.path_2, targetLinesOf(link)),
      mirrorRecord(link)
    ])
    .filter((record): record is LinkRecord => record !== null)
    .filter(record => {
      const key = `${record.line_index_1}|${record.line_index_2}|${record.path_2}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { records, misses };
}
