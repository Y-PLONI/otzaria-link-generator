import { SEFARIA_REF_TABLE } from '../data/sefariaRefTable';
import { resolveBakedRef } from './sefariaRefs';
import { isHeaderLine, extractHeaderTitle } from './parserAlgorithm';

/**
 * ── ציטוט נושא כלים לפי מספר ס"ק ───────────────────────────────────────────────────────────────
 *
 * על השו"ע מפנים לנושאי הכלים לפי ס"ק ("ש"ך ס"ק כ'", "סי' קי"ט ט"ז סק"ג"), לא לפי ד"ה. הציטוט מזהה
 * את השורה עצמה: הס"ק ה-N של הסימן. בספרים שהספרייה ממספרת בהם (סימן, ס"ק) המיפוי נלקח מהטבלה
 * האפויה (heRef); בש"ך ובקצות החושן, שהספרייה ממספרת בהם לפי סעיף, הס"ק רץ לאורך הסימן והוא השורה
 * ה-N מתחת לכותרת הסימן (נבדק מול קישורי הספרייה).
 */

export interface SeifKatanCitation {
  sourceId: string;
  /** סימן מפורש בציטוט; בלעדיו — הסימן העוטף בפירוש */
  siman?: number;
  /** הס"ק הראשון; שורה מקושרת אחת לכל שורת פירוש */
  seifKatan: number;
  /** הטקסט שאחרי "ד"ה", או ריק כשאין ד"ה */
  dh: string;
}

const VALUES: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10,
  'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80,
  'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400
};

/** ערך של מספר עברי תקין (אותיות יורדות, טו/טז), או null למילה שאינה מספר. */
export function hebrewNumeral(text: string): number | null {
  let letters = text.replace(/['"]/g, '');
  if (!letters || letters.length > 4) return null;
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

const NUM = `([\\u05d0-\\u05ea]{1,4}(?:["'][\\u05d0-\\u05ea]?)?)`;
const SIMAN = `(?:סי['"]?|סימן)\\s*${NUM}[\\s,.]*`;
const SK = `(?:ס"ק|סעיף\\s+קטן)\\s*${NUM}|סק("?[\\u05d0-\\u05ea]{1,3}(?:"[\\u05d0-\\u05ea])?)`;
// מספרים נוספים ("וד'", "-ה") נבלעים: הקישור לראשון בלבד
const MORE = `(?:\\s*(?:[-–,]\\s*|\\s+ו)[\\u05d0-\\u05ea]{1,4}["']?[\\u05d0-\\u05ea]?(?![\\u05d0-\\u05ea]))*`;
const END = `(?![\\u05d0-\\u05ea"'])`;

const regexCache = new Map<string, { kwFirst: RegExp; skFirst: RegExp }>();

function regexesFor(keywords: string[]) {
  const key = keywords.join('|');
  let re = regexCache.get(key);
  if (!re) {
    const kw = `(?:${[...keywords].sort((a, b) => b.length - a.length).join('|')})`;
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
  sources: { id: string; keywords: string[] }[]
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
    const { kwFirst, skFirst } = regexesFor(source.keywords);
    const k = kwFirst.exec(text);
    const f = k ? null : skFirst.exec(text);
    const m = k ?? f;
    if (!m) continue;
    // kwFirst: סימן לפני השם, סימן אחריו, ס"ק מרווח, ס"ק מודבק. skFirst: סימן, ס"ק מרווח, מודבק.
    const simanText = k ? (k[1] ?? k[2]) : f![1];
    const skText = k ? (k[3] ?? k[4]) : (f![2] ?? f![3]);
    const seifKatan = skText ? hebrewNumeral(skText) : null;
    if (!seifKatan) continue;
    const siman = simanText ? hebrewNumeral(simanText) ?? undefined : undefined;
    const rest = text.slice(m[0].length).replace(/^[\s,.:;)]+/, '');
    const dh = /^ב?ד"ה(?![א-ת])/.test(rest) ? rest.replace(/^ב?ד"ה[\s,.:]*/, '') : '';
    return { sourceId: source.id, siman, seifKatan, dh };
  }
  return null;
}

/** מספר הסימן שבכותרת ("סימן קיט"), או null. */
export function simanNumber(headerTitle: string | undefined): number | null {
  const m = headerTitle?.match(/סימן\s+([א-ת"'״׳]+)/);
  return m ? hebrewNumeral(m[1].replace(/[״׳]/g, '')) : null;
}

const textIndexCache = new WeakMap<string[], Map<string, number>>();
const bakedIndexCache = new WeakMap<string[], Map<string, Map<string, number>>>();

/** (סימן, N) → השורה ה-N שאינה כותרת ואינה ריקה מתחת לכותרת הסימן; כותרת "סעיף" אינה עוצרת את הספירה. */
function textIndex(lines: string[]): Map<string, number> {
  let index = textIndexCache.get(lines);
  if (index) return index;
  index = new Map();
  let siman: number | null = null;
  let n = 0;
  lines.forEach((line, i) => {
    if (isHeaderLine(line)) {
      const title = extractHeaderTitle(line);
      const s = simanNumber(title);
      if (s !== null) { siman = s; n = 0; } else if (!/סעיף/.test(title)) siman = null;
      return;
    }
    if (siman === null || !line.trim()) return;
    index!.set(`${siman}:${++n}`, i + 1);
  });
  textIndexCache.set(lines, index);
  return index;
}

/** (סימן, ס"ק) → שורה מתוך הטבלה האפויה, לספר שכתובתו בה היא בדיוק [סימן, ס"ק]. */
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
    const m = /^(\d+):(\d+)$/.exec(r.ref.slice(prefix.length));
    if (m) index.set(`${m[1]}:${m[2]}`, line);
  }
  perBook.set(title, index);
  return index.size ? index : null;
}

/** השורה (1-based) של ס"ק `seifKatan` בסימן `siman` של הספר, או null כשאין כזה. */
export function seifKatanLine(title: string, lines: string[], siman: number, seifKatan: number): number | null {
  const key = `${siman}:${seifKatan}`;
  const baked = bakedIndex(title, lines);
  return (baked ? baked.get(key) : textIndex(lines).get(key)) ?? null;
}
