import { SEFARIA_REF_TABLE, SEFARIA_COMMENTARY_BASES, SEFARIA_COMMENTATORS } from '../data/sefariaRefTable';
import { isHeaderLine, extractHeaderTitle } from './parserAlgorithm';

/**
 * ── ref_2: the stable Sefaria reference of a link's target line ──────────────────────────
 *
 * otzaria-library's weekly sync resolves every link whose target is a Sefaria-owned book by
 * its English Sefaria ref (`Berakhot 2a:1`, `Rashi on Berakhot 2a:1:1`), not by the line
 * number, and rejects a record to such a book that carries none. A record to any other book
 * must carry none.
 *
 * Base texts are derived from the text itself: a daf/chapter header and the line's offset
 * under it is the whole address, on every line of the library's Bavli and Tanakh.
 * Commentaries are not — the second number of `Rashi on Berakhot 2a:3:1` is the gemara
 * segment the comment belongs to, which the Rashi text does not state — so their addresses
 * are read from the library's own heRef column into src/data/sefariaRefTable.ts by
 * scripts/generate-sefaria-refs.mjs.
 */

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
  /** The same address in the library's Hebrew notation, e.g. `ברכות ב., א` */
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

const DAF_HEADER_RE = /^דף\s+([א-ת'"׳״]+?)\s*([.:])$/;
const CHAPTER_HEADER_RE = /^פרק\s+([א-ת'"׳״]+)$/;

const derivedCache = new WeakMap<string[], (Address | null)[]>();

/** Every line's [amud|chapter, line-under-header], or null for a header or a line before the first one. */
function deriveBaseAddresses(lines: string[], isGemara: boolean): (Address | null)[] {
  const cached = derivedCache.get(lines);
  if (cached) return cached;
  const out: (Address | null)[] = new Array(lines.length).fill(null);
  let section: number | null = null;
  let offset = 0;
  lines.forEach((line, i) => {
    if (isHeaderLine(line)) {
      const title = extractHeaderTitle(line).trim();
      const m = title.match(isGemara ? DAF_HEADER_RE : CHAPTER_HEADER_RE);
      const n = m ? hebrewToNumber(m[1]) : null;
      if (m && n) {
        section = isGemara ? n * 2 - (m[2] === '.' ? 1 : 0) : n;
        offset = 0;
      }
      return;
    }
    if (section !== null) out[i] = [section, ++offset];
  });
  derivedCache.set(lines, out);
  return out;
}

/**
 * Decodes one book of the baked table — see scripts/generate-sefaria-refs.mjs for the grammar.
 * Returns, per 0-based line, the node index and address, or null.
 */
function decodeBaked(refs: string, lineCount: number): ({ node: number; address: Address } | null)[] {
  const out: ({ node: number; address: Address } | null)[] = [];
  let node = 0;
  let prev: Address | null = null;
  const emit = (address: Address) => { out.push({ node, address }); prev = address; };
  const tokenRe = /([.+=#]|\^+|[A-Z])([0-9a-z:]*)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(refs))) {
    const [, op, arg] = m;
    const values = arg ? arg.split(':').map(v => parseInt(v, 36)) : [];
    if (op === '.') {
      for (let i = 0; i < (values[0] || 1); i++) out.push(null);
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
  while (out.length < lineCount) out.push(null);
  return out;
}

const bakedCache = new Map<string, ({ node: number; address: Address } | null)[]>();

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
 * Whether a commentary title of the form `<מפרש> על <ספר>` is itself a Sefaria book, whose links would
 * then need ref_1 as well. Titles of any other form are not covered.
 */
export function isSefariaOwnedCommentary(title: string): boolean {
  const at = title.lastIndexOf(' על ');
  if (at < 0) return false;
  const base = SEFARIA_COMMENTARY_BASES.indexOf(title.slice(at + 4));
  const bases = SEFARIA_COMMENTATORS[title.slice(0, at)];
  return base >= 0 && Boolean(bases) && bases.split(',').some(v => parseInt(v, 36) === base);
}

/**
 * ref_2 (and a matching Hebrew heRef) of 1-based line `line` of book `title`, or undefined when
 * the line has no Sefaria address — a header, or a commentary text that is not the version
 * the table was built from. `lines` is the target text as the plugin loaded it.
 */
export function sefariaRefFor(title: string, line: number, lines?: string[]): SefariaRef | undefined {
  const idx = line - 1;
  if (idx < 0) return undefined;

  const gemara = GEMARA_EN[title];
  const tanakh = TANAKH_EN[title];
  if (gemara || tanakh) {
    if (!lines) return undefined;
    const address = deriveBaseAddresses(lines, Boolean(gemara))[idx];
    return address ? formatRef(`${gemara || tanakh} `, `${title} `, address, Boolean(gemara)) : undefined;
  }

  const entry = SEFARIA_REF_TABLE[title];
  if (!entry) return undefined;
  // Line numbers of another version of the book would name other comments.
  if (lines && contentLength(lines) !== entry.lines) return undefined;
  let decoded = bakedCache.get(title);
  if (!decoded) {
    decoded = decodeBaked(entry.refs, entry.lines);
    bakedCache.set(title, decoded);
  }
  const hit = decoded[idx];
  if (!hit) return undefined;
  const [enPrefix, hePrefix, firstIsAmud] = entry.nodes[hit.node];
  return formatRef(enPrefix, hePrefix, hit.address, Boolean(firstIsAmud));
}
