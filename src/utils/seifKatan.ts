import { SEFARIA_REF_TABLE } from '../data/sefariaRefTable';
import { resolveBakedRef } from './sefariaRefs';

/**
 * ── ציטוט נושא כלים לפי מספר ס"ק ───────────────────────────────────────────────────────────────
 *
 * על השו"ע מפנים לנושאי הכלים לפי ס"ק ("ש"ך ס"ק כ'", "סי' קי"ט ט"ז סק"ג"), לא לפי ד"ה. הציטוט מזהה
 * את השורה עצמה, והמיפוי נלקח מהטבלה האפויה (heRef): (סימן, ס"ק), ובש"ך ובקצות החושן (סימן, ס"ק,
 * פסקה) — הפסקה הראשונה של הס"ק.
 */

export interface SeifKatanCitation {
  sourceId: string;
  /** סימן מפורש בציטוט; בלעדיו — הסימן העוטף בפירוש */
  siman?: number;
  /** הס"ק הראשון; שורה מקושרת אחת לכל שורת פירוש */
  seifKatan: number;
  /** הטקסט שאחרי "ד"ה", או ריק כשאין ד"ה */
  dh: string;
  /** השם שנכתב הוא גם קיצור של ספר אחר (ח"מ): הקישור דורש הכרעה */
  ambiguous: boolean;
}

const VALUES: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10,
  'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80,
  'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400
};

/** ערך של מספר עברי תקין (אותיות יורדות, טו/טז), או null למילה שאינה מספר. */
export function hebrewNumeral(text: string): number | null {
  let letters = text.replace(/['"]/g, '');
  if (!letters || letters.length > 4 || /[ךםןףץ]/.test(letters)) return null;
  // מילה רגילה שצורתה צורת מספר נקראת מספר רק עם גרש או גרשיים
  if (letters === text && COMMON_WORDS.has(letters)) return null;
  let tail = 0;
  if (/ט[וז]$/.test(letters)) { tail = letters.endsWith('ו') ? 15 : 16; letters = letters.slice(0, -2); }
  let total = tail;
  let prev = Infinity;
  for (const ch of letters) {
    const v = VALUES[ch];
    if (!v || v > prev || (v === prev && v < 400)) return null;
    total += v;
    prev = v;
  }
  return total || null;
}

const COMMON_WORDS = new Set(['זה', 'זו', 'זהו', 'בו', 'בה', 'בא', 'לא', 'כי', 'כה', 'גב']);

const NUM = `([\\u05d0-\\u05ea]{1,4}(?:["'][\\u05d0-\\u05ea]?)?)`;
const END = `(?![\\u05d0-\\u05ea"'])`;
const SIMAN = `(?:סימן|סי['"])\\s*${NUM}${END}[\\s,.]*`;
const SK = `(?:ס"ק|סעיף\\s+קטן)\\s*${NUM}|סק("?[\\u05d0-\\u05ea]{1,3}(?:"[\\u05d0-\\u05ea])?)`;
// מספרים נוספים ("וד'", "-ה") נבלעים: הקישור לראשון בלבד
const MORE = `(?:\\s*(?:[-–,]\\s*|\\s+ו)[\\u05d0-\\u05ea]{1,4}["']?[\\u05d0-\\u05ea]?(?![\\u05d0-\\u05ea]))*`;
const regexCache = new Map<string, { kwFirst: RegExp; skFirst: RegExp }>();

function regexesFor(keywords: string[]) {
  const key = keywords.join('|');
  let re = regexCache.get(key);
  if (!re) {
    const kw = `(${[...keywords].sort((a, b) => b.length - a.length).join('|')})`;
    re = {
      kwFirst: new RegExp(`^\\(?\\s*(?:${SIMAN})?(?:ו|וב)?${kw}${END}[\\s,.]*(?:${SIMAN})?(?:${SK})${END}${MORE}\\)?`),
      skFirst: new RegExp(`^\\(?\\s*(?:${SIMAN})?(?:${SK})${END}${MORE}[\\s,.]*(?:ב|ו|וב)?${kw}${END}\\)?`)
    };
    regexCache.set(key, re);
  }
  return re;
}

/** קריאת הציטוט בראש השורה, אחרי מספור ההלכה; null כשאין ציטוט ס"ק של אחד מ-`sources`. */
export function parseSeifKatanCitation(
  line: string,
  sources: { id: string; keywords: string[]; noSeifKatan?: true }[]
): SeifKatanCitation | null {
  if (!/ס"?ק|סעיף\s+קטן|ס״ק/.test(line)) return null;
  const text = line
    .replace(/<[^>]*>/g, ' ')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  for (const source of sources) {
    if (source.noSeifKatan) continue;
    const { kwFirst, skFirst } = regexesFor(source.keywords);
    const k = kwFirst.exec(text);
    const f = k ? null : skFirst.exec(text);
    const m = k ?? f;
    if (!m) continue;
    // kwFirst: סימן, שם, סימן, ס"ק מרווח, ס"ק מודבק. skFirst: סימן, ס"ק מרווח, מודבק, שם.
    const simanText = k ? (k[1] ?? k[3]) : f![1];
    const skText = k ? (k[4] ?? k[5]) : (f![2] ?? f![3]);
    const name = (k ? k[2] : f![4]).replace(/^ב/, '');
    const seifKatan = skText ? hebrewNumeral(skText) : null;
    if (!seifKatan) continue;
    const siman = simanText ? hebrewNumeral(simanText) ?? undefined : undefined;
    const rest = text.slice(m[0].length).replace(/^[\s,.:;)]+/, '');
    const dh = /^ב?ד"ה(?![א-ת])/.test(rest) ? rest.replace(/^ב?ד"ה[\s,.:]*/, '') : '';
    return { sourceId: source.id, siman, seifKatan, dh, ambiguous: AMBIGUOUS_NAMES.has(name) };
  }
  return null;
}

/** קיצור שהוא גם שם של ספר אחר: ח"מ באבן העזר עשוי להיות חושן משפט. */
const AMBIGUOUS_NAMES = new Set(['ח"מ']);

/** מספר הסימן שבכותרת ("סימן קיט"), או null. */
export function simanNumber(headerTitle: string | undefined): number | null {
  const m = headerTitle?.match(/סימן\s+([א-ת"'״׳]+)/);
  return m ? hebrewNumeral(m[1].replace(/[״׳]/g, '')) : null;
}

const bakedIndexCache = new WeakMap<string[], Map<string, Map<string, number>>>();

/** (סימן, ס"ק) → שורה מתוך הטבלה האפויה: כתובת [סימן, ס"ק], או הפסקה הראשונה של [סימן, ס"ק, פסקה]. */
function bakedIndex(title: string, lines: string[]): Map<string, number> | null {
  const entry = SEFARIA_REF_TABLE[title];
  if (!entry) return null;
  let perBook = bakedIndexCache.get(lines);
  if (!perBook) { perBook = new Map(); bakedIndexCache.set(lines, perBook); }
  let index = perBook.get(title);
  if (index) return index.size ? index : null;
  index = new Map();
  const prefix = entry.nodes[0][0];
  for (let line = 1; line <= lines.length; line++) {
    const r = resolveBakedRef(entry, line, lines);
    if (typeof r === 'string' || !r.ref.startsWith(prefix)) continue;
    const m = /^(\d+):(\d+)(?::(\d+))?$/.exec(r.ref.slice(prefix.length));
    if (m && (!m[3] || m[3] === '1') && !index.has(`${m[1]}:${m[2]}`)) index.set(`${m[1]}:${m[2]}`, line);
  }
  perBook.set(title, index);
  return index.size ? index : null;
}

/** השורה (1-based) של ס"ק `seifKatan` בסימן `siman` של הספר, או null כשאין כזה. */
export function seifKatanLine(title: string, lines: string[], siman: number, seifKatan: number): number | null {
  return bakedIndex(title, lines)?.get(`${siman}:${seifKatan}`) ?? null;
}
