import { SEFARIA_REF_TABLE, SEFARIA_COMMENTARY_BASES, SEFARIA_COMMENTATORS } from '../data/sefariaRefTable';
import { normalizeRefText, refSegments } from './refSignatures.mjs';
export { segmentHash } from './refSignatures.mjs';
import { isHeaderLine, extractHeaderTitle } from './parserAlgorithm';

// ref_2 of every supported target comes from a baked table anchored by content and heading context.
// Physical indices are translated only after the loaded segment has been verified. Rationale and encoding: docs/DOUBLE_LINKS_AND_REVERSE_EXPORT.md, section 9.

/** Library title of a Bavli tractate -> its Sefaria title. */
export const GEMARA_EN: Record<string, string> = {
  "ברכות": "Berakhot",
  "שבת": "Shabbat",
  "עירובין": "Eruvin",
  "פסחים": "Pesachim",
  "ראש השנה": "Rosh Hashanah",
  "יומא": "Yoma",
  "סוכה": "Sukkah",
  "ביצה": "Beitzah",
  "תענית": "Taanit",
  "מגילה": "Megillah",
  "מועד קטן": "Moed Katan",
  "חגיגה": "Chagigah",
  "יבמות": "Yevamot",
  "כתובות": "Ketubot",
  "נדרים": "Nedarim",
  "נזיר": "Nazir",
  "סוטה": "Sotah",
  "גיטין": "Gittin",
  "קידושין": "Kiddushin",
  "בבא קמא": "Bava Kamma",
  "בבא מציעא": "Bava Metzia",
  "בבא בתרא": "Bava Batra",
  "סנהדרין": "Sanhedrin",
  "מכות": "Makkot",
  "שבועות": "Shevuot",
  "עבודה זרה": "Avodah Zarah",
  "הוריות": "Horayot",
  "זבחים": "Zevachim",
  "מנחות": "Menachot",
  "חולין": "Chullin",
  "בכורות": "Bekhorot",
  "ערכין": "Arakhin",
  "תמורה": "Temurah",
  "כריתות": "Keritot",
  "מעילה": "Meilah",
  "תמיד": "Tamid",
  "נדה": "Niddah",
};

/** Library title of a Tanakh book -> its Sefaria title. */
export const TANAKH_EN: Record<string, string> = {
  "בראשית": "Genesis",
  "שמות": "Exodus",
  "ויקרא": "Leviticus",
  "במדבר": "Numbers",
  "דברים": "Deuteronomy",
  "יהושע": "Joshua",
  "שופטים": "Judges",
  "שמואל א": "I Samuel",
  "שמואל ב": "II Samuel",
  "מלכים א": "I Kings",
  "מלכים ב": "II Kings",
  "ישעיהו": "Isaiah",
  "ירמיהו": "Jeremiah",
  "יחזקאל": "Ezekiel",
  "הושע": "Hosea",
  "יואל": "Joel",
  "עמוס": "Amos",
  "עובדיה": "Obadiah",
  "יונה": "Jonah",
  "מיכה": "Micah",
  "נחום": "Nahum",
  "חבקוק": "Habakkuk",
  "צפניה": "Zephaniah",
  "חגי": "Haggai",
  "זכריה": "Zechariah",
  "מלאכי": "Malachi",
  "תהילים": "Psalms",
  "משלי": "Proverbs",
  "איוב": "Job",
  "שיר השירים": "Song of Songs",
  "רות": "Ruth",
  "איכה": "Lamentations",
  "קהלת": "Ecclesiastes",
  "אסתר": "Esther",
  "דניאל": "Daniel",
  "עזרא": "Ezra",
  "נחמיה": "Nehemiah",
  "דברי הימים א": "I Chronicles",
  "דברי הימים ב": "II Chronicles",
};

export interface SefariaRef {
  /** English Sefaria ref, e.g. `Berakhot 2a:1` */
  ref: string;
  /** The same address as the library's links files write heRef_2, e.g. `ברכות ב., א` */
  heRef: string;
}

/** One numbered address; a daf is stored as its amud: 2a = 3, 2b = 4. */
type Address = number[];

const LETTER_VALUES: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
  'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50,
  'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90,
  'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400
};

export function hebrewToNumber(text: string): number | null {
  const letters = text.replace(/['"׳״]/g, '');
  if (!letters) return null;
  let total = 0;
  for (const ch of letters) {
    const value = LETTER_VALUES[ch];
    if (!value) return null;
    total += value;
  }
  return total;
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש'];

/** Hebrew numeral as the library writes it in heRef: no gershayim, 15 = טו, 16 = טז. */
export function numberToHebrew(n: number): string {
  let out = '';
  let rest = n;
  while (rest >= 400) { out += 'ת'; rest -= 400; }
  out += HUNDREDS[Math.floor(rest / 100)];
  rest %= 100;
  if (rest === 15) return out + 'טו';
  if (rest === 16) return out + 'טז';
  return out + TENS[Math.floor(rest / 10)] + ONES[rest % 10];
}

function formatRef(enPrefix: string, hePrefix: string, address: Address, firstIsAmud: boolean): SefariaRef {
  const daf = (amud: number) => Math.ceil(amud / 2);
  const en = address.map((v, i) => (i === 0 && firstIsAmud ? `${daf(v)}${v % 2 ? 'a' : 'b'}` : String(v)));
  const he = address.map((v, i) => (i === 0 && firstIsAmud ? `${numberToHebrew(daf(v))}${v % 2 ? '.' : ':'}` : numberToHebrew(v)));
  return { ref: enPrefix + en.join(':'), heRef: hePrefix + he.join(', ') };
}

type BakedLine = { node: number; address: Address } | null;
/** One table segment: a header line and the lines up to the next one. */
interface BakedSegment { hash: string; lines: BakedLine[] }
export type BakedBook = { signature?: string; nodes: [string, string, number][]; refs: string };

/** A content signature, insensitive to nikud, whitespace and inline markup. */
export function lineSignature(line: string): string {
  if (isHeaderLine(line)) {
    const level = line.match(/<h([1-6])/i)?.[1] ?? String(line.trim().match(/^#+/)?.[0].length);
    return 'H' + level + ':' + normalizeRefText(extractHeaderTitle(line));
  }
  return 'L' + normalizeRefText(line);
}

/**
 * Decodes one book of the baked table — see scripts/generate-sefaria-refs.mjs for the grammar.
 */
function decodeBaked(refs: string): BakedSegment[] {
  const segments: BakedSegment[] = [];
  let node = 0;
  let prev: Address | null = null;
  const push = (line: BakedLine) => segments[segments.length - 1].lines.push(line);
  const emit = (address: Address) => { push({ node, address }); prev = address; };
  const tokenRe = /([.+=#|]|\^+|[A-Z])([0-9a-z:]*)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(refs))) {
    const [, op, arg] = m;
    if (op === '|') {
      segments.push({ hash: arg, lines: [] });
      continue;
    }
    const values = arg ? arg.split(':').map(v => parseInt(v, 36)) : [];
    if (op === '.') {
      for (let i = 0; i < (values[0] || 1); i++) push(null);
    } else if (op === '#') {
      node = values[0];
      prev = null;
    } else if (op === '=') {
      emit(values);
    } else if (op === '+') {
      for (let i = 0; i < (values[0] || 1); i++) {
        const next: Address = [...prev!];
        next[next.length - 1]++;
        emit(next);
      }
    } else {
      // '^'×k or a capital letter (= one '^' with delta A=1…Z=26): bump level len-1-k, then the
      // explicit lower values, then 1 for whatever is left.
      const base: Address = prev!;
      const k = op[0] === '^' ? op.length : 1;
      const delta = op[0] === '^' ? values[0] : op.charCodeAt(0) - 64;
      const level = base.length - 1 - k;
      const lower = op[0] === '^' ? values.slice(1) : [];
      const next: Address = [...base.slice(0, level), base[level] + delta];
      while (next.length < base.length) next.push(lower[next.length - level - 1] ?? 1);
      emit(next);
    }
  }
  return segments;
}

type Resolved = { hit: BakedLine; changed: boolean; originalLine?: number };

/**
 * Maps every loaded line to its table address. Segments are matched in order by line count and
 * checksum, so a library edit costs only the segments it touched — their lines get no address.
 */
function alignBaked(table: BakedSegment[], lines: string[]): Resolved[] {
  const length = contentLength(lines);
  const out: Resolved[] = new Array(length);
  const segs = refSegments(lines.slice(0, length).map(lineSignature));
  const same = (s: number, t: number) =>
    table[t].hash === segs[s].hash && table[t].lines.length === segs[s].end - segs[s].start;
  const originalStarts: number[] = [];
  let originalStart = 1;
  for (const segment of table) { originalStarts.push(originalStart); originalStart += segment.lines.length; }
  // Index checksums once; an unmatched segment need not scan hundreds of unrelated segments.
  // This also keeps valid references after long runs of removed headings.
  const bySignature = new Map<string, number[]>();
  table.forEach((segment, index) => {
    const key = `${segment.hash}:${segment.lines.length}`;
    const indices = bySignature.get(key);
    if (indices) indices.push(index);
    else bySignature.set(key, [index]);
  });
  const loadedCounts = new Map<string, number>();
  for (const segment of segs) {
    const key = `${segment.hash}:${segment.end - segment.start}`;
    loadedCounts.set(key, (loadedCounts.get(key) ?? 0) + 1);
  }
  let next = 0;
  segs.forEach((seg, s) => {
    let match = -1;
    const candidates = bySignature.get(`${seg.hash}:${seg.end - seg.start}`) ?? [];
    let low = 0, high = candidates.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (candidates[middle] < next) low = middle + 1;
      else high = middle;
    }
    // If identical sections were inserted/removed, their identity is ambiguous even with a
    // perfect checksum. Reject them rather than attach an old address to the surviving copy.
    const unambiguous = candidates.length === loadedCounts.get(`${seg.hash}:${seg.end - seg.start}`);
    for (let i = low; unambiguous && i < candidates.length; i++) {
      const t = candidates[i];
      // A jump past table segments must be confirmed by the segment after it too.
      if (t === next || s + 1 >= segs.length || t + 1 >= table.length || same(s + 1, t + 1)) {
        match = t;
        break;
      }
    }
    if (match >= 0) next = match + 1;
    for (let i = seg.start; i < seg.end; i++) {
      out[i] = match >= 0 ? { hit: table[match].lines[i - seg.start], changed: false, originalLine: originalStarts[match] + i - seg.start } : { hit: null, changed: true };
    }
  });
  return out;
}

const decodedCache = new WeakMap<BakedBook, BakedSegment[]>();
const alignedCache = new WeakMap<string[], Map<BakedBook, Resolved[]>>();

/** Lines in the text the plugin loaded, ignoring a trailing newline. */
function contentLength(lines: string[]): number {
  let n = lines.length;
  while (n > 0 && lines[n - 1] === '') n--;
  return n;
}

/** The book title a `path_2` names: the file name without `.txt`. */
export function titleOfPath(path2: string): string {
  const file = path2.split(/[\\/]/).pop() || path2;
  return file.replace(/\.txt$/, '');
}

/**
 * Whether the library treats `title` as a Sefaria book, so a link to it must carry ref_2.
 * Covers every target this plugin can link to.
 */
export function isSefariaOwnedTarget(title: string): boolean {
  return title in GEMARA_EN || title in TANAKH_EN || title in SEFARIA_REF_TABLE;
}

/**
 * Known supported Sefaria titles, and `<מפרש> על <ספר>` titles in the Sefaria snapshot.
 * Links from them to local books need ref_1; Sefaria↔Sefaria manual links are forbidden.
 */
export function isSefariaOwnedCommentary(title: string): boolean {
  if (isSefariaOwnedTarget(title)) return true;
  const at = title.lastIndexOf(' על ');
  if (at < 0) return false;
  const base = SEFARIA_COMMENTARY_BASES.indexOf(title.slice(at + 4));
  const bases = SEFARIA_COMMENTATORS[title.slice(0, at)];
  return base >= 0 && Boolean(bases) && bases.split(',').some(v => parseInt(v, 36) === base);
}

/** Why a line got no ref: a header line, a segment the library has changed, or no Sefaria address. */
export type SefariaRefMiss = 'header' | 'changed' | 'unaddressed';

/** A baked book's ref for 1-based `line` of `lines`; exported for tests with a synthetic table. */
export function resolveBakedRef(entry: BakedBook, line: number, lines: string[]): SefariaRef | SefariaRefMiss {
  const idx = line - 1;
  if (!Number.isSafeInteger(line) || idx < 0 || idx >= contentLength(lines)) return 'unaddressed';
  if (isHeaderLine(lines[idx])) return 'header';
  const aligned = alignedBook(entry, lines);
  const { hit, changed } = aligned[idx];
  if (changed) return 'changed';
  if (!hit) return 'unaddressed';
  const [enPrefix, hePrefix, firstIsAmud] = entry.nodes[hit.node];
  return formatRef(enPrefix, hePrefix, hit.address, Boolean(firstIsAmud));
}

/** Shared alignment, also used to translate BOTH sides of mirror rows. */
function alignedBook(entry: BakedBook, lines: string[]): Resolved[] {
  let table = decodedCache.get(entry);
  if (!table) {
    table = decodeBaked(entry.refs);
    decodedCache.set(entry, table);
  }
  let perBook = alignedCache.get(lines);
  if (!perBook) {
    perBook = new Map();
    alignedCache.set(lines, perBook);
  }
  let aligned = perBook.get(entry);
  if (!aligned) {
    aligned = alignBaked(table, lines);
    perBook.set(entry, aligned);
  }
  return aligned;
}

const originalToCurrentCache = new WeakMap<string[], Map<BakedBook, Map<number, number>>>();

/** Loaded 1-based line -> the verified line in the table's snapshot. */
export function originalBakedLine(title: string, line: number, lines: string[]): number | undefined {
  const entry = SEFARIA_REF_TABLE[title];
  return entry ? alignedBook(entry, lines)[line - 1]?.originalLine : undefined;
}

/** Snapshot 1-based line -> the verified line in the loaded text; absent if that segment changed. */
export function currentBakedLine(title: string, originalLine: number, lines: string[]): number | undefined {
  const entry = SEFARIA_REF_TABLE[title];
  if (!entry) return undefined;
  let books = originalToCurrentCache.get(lines);
  if (!books) { books = new Map(); originalToCurrentCache.set(lines, books); }
  let reverse = books.get(entry);
  if (!reverse) {
    reverse = new Map();
    alignedBook(entry, lines).forEach((row, i) => {
      if (row.originalLine !== undefined) reverse!.set(row.originalLine, i + 1);
    });
    books.set(entry, reverse);
  }
  return reverse.get(originalLine);
}

/**
 * ref_2 (and a matching Hebrew heRef) of 1-based line `line` of book `title`, or the reason it
 * has none. `lines` is the target text as the plugin loaded it.
 */
export function resolveSefariaRef(title: string, line: number, lines?: string[]): SefariaRef | SefariaRefMiss {
  if (!lines) return 'unaddressed';
  if (line >= 1 && line <= lines.length && isHeaderLine(lines[line - 1])) return 'header';
  const entry = SEFARIA_REF_TABLE[title];
  if (entry) return resolveBakedRef(entry, line, lines);
  return 'unaddressed';
}

/** resolveSefariaRef without the reason. */
export function sefariaRefFor(title: string, line: number, lines?: string[]): SefariaRef | undefined {
  const result = resolveSefariaRef(title, line, lines);
  return typeof result === 'string' ? undefined : result;
}
