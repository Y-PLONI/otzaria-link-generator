/**
 * Builds src/data/sefariaRefTable.ts — the Sefaria address (ref_2) of every line of the
 * commentaries and halacha books the plugin links to, read from the library's own heRef column.
 * The base texts (Bavli, Tanakh) need no table: src/utils/sefariaRefs.ts derives them from the
 * text. See that file for why ref_2 exists at all.
 *
 *   node scripts/generate-sefaria-refs.mjs
 *
 * Inputs, none of them committed:
 *   - the local library database (OTZARIA_DB overrides the default install location);
 *   - data/sefaria/sefaria_he_titles.txt and data/sefaria/sefaria_ref_prefixes.tsv, the
 *     snapshots otzaria-library validates links against:
 *       gh api repos/Otzaria/otzaria-library/contents/.github/data/<name> -H "Accept: application/vnd.github.raw"
 *   - data/sefaria/line-signatures.json, from `python scripts/extract-sefaria-signatures.py`.
 * When any is missing this script keeps the committed table and exits 0, like the mirror table.
 *
 * ── Encoding ────────────────────────────────────────────────────────────────────────────────
 * Per book, one string of tokens walking its lines from line 1, cut into segments: line 1 and
 * every header line open one, marked `|hhh` with the checksum of its text (segmentHash in
 * src/utils/sefariaRefs.ts), so a reader can tell which segments still match the library. An address is a list of numbers
 * (a daf is stored as its amud: 2a = 3, 2b = 4); every token is relative to the previous one:
 *   .n      n lines with no address (n in base36, default 1)
 *   +n      n lines, each the previous address with its last number + 1
 *   ^…^d:v  one line: the number k places above the last (k = count of ^) grows by d, the numbers
 *           below it become v… and then 1
 *   A…Z     shorthand for ^1 … ^26
 *   =a:b:c  one line, the full address
 *   #i      the following lines belong to node i of the book (a book with sub-books)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const projectRoot = process.cwd();
const outFile = path.join(projectRoot, 'src', 'data', 'sefariaRefTable.ts');
const DB = process.env.OTZARIA_DB
  || path.join(os.homedir(), 'AppData', 'Roaming', 'otzaria', 'books', 'seforim.db');
const titlesFile = path.join(projectRoot, 'data', 'sefaria', 'sefaria_he_titles.txt');
const prefixesFile = path.join(projectRoot, 'data', 'sefaria', 'sefaria_ref_prefixes.tsv');
const signaturesFile = path.join(projectRoot, 'data', 'sefaria', 'line-signatures.json');

const missingInputs = [DB, titlesFile, prefixesFile, signaturesFile].filter(f => !fs.existsSync(f));
if (missingInputs.length) {
  const verb = fs.existsSync(outFile) ? 'keeping the committed table' : 'NO TABLE WILL EXIST';
  console.warn(`sefaria-refs: missing ${missingInputs.join(', ')} — ${verb}.`);
  process.exit(0);
}

const { DatabaseSync } = await import('node:sqlite');

const RASHI = 'רש"י על ';
const TOSAFOT = 'תוספות על ';

/** halacha book -> its nodes: [Hebrew node name ('' = the book itself), English ref prefix] */
const HALACHA_NODES = {
  'שולחן ערוך, אורח חיים': [['', 'Shulchan Arukh, Orach Chayim ']],
  'שולחן ערוך, יורה דעה': [['', "Shulchan Arukh, Yoreh De'ah "]],
  'שולחן ערוך, אבן העזר': [
    ['', 'Shulchan Arukh, Even HaEzer,  '],
    ['סדר הגט', 'Shulchan Arukh, Even HaEzer, Seder HaGet,  '],
    ['סדר חליצה', 'Shulchan Arukh, Even HaEzer, Seder Halitzah,  '],
  ],
  'שולחן ערוך, חושן משפט': [['', 'Shulchan Arukh, Choshen Mishpat ']],
};

function readArray(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const block = src.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!block) throw new Error(`${name} not found in ${file}`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
}

function readMap(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const block = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\};`));
  if (!block) throw new Error(`${name} not found in ${file}`);
  return Object.fromEntries([...block[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map(m => [m[1], m[2]]));
}

const typesFile = path.join(projectRoot, 'src', 'types.ts');
const refsFile = path.join(projectRoot, 'src', 'utils', 'sefariaRefs.ts');
const SHAS = readArray(typesFile, 'SHAS_TRACTATES');
const TANAKH = readArray(typesFile, 'TANAKH_BOOKS');
const HALACHA = readArray(typesFile, 'HALACHA_BOOKS');
const GEMARA_EN = readMap(refsFile, 'GEMARA_EN');
const TANAKH_EN = readMap(refsFile, 'TANAKH_EN');

const heTitles = new Set(fs.readFileSync(titlesFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
const signatures = JSON.parse(fs.readFileSync(signaturesFile, 'utf8'));
const prefixes = new Map();
for (const line of fs.readFileSync(prefixesFile, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [prefix, offsets = ''] = line.split('\t');
  prefixes.set(prefix, offsets.trim());
}

const errors = [];
/** A prefix the validator does not know, or one with index offsets, would emit refs that resolve to nothing. */
function checkPrefix(prefix, owner) {
  if (!prefixes.has(prefix)) errors.push(`${owner}: prefix ${JSON.stringify(prefix)} is not in the Sefaria snapshot`);
  else if (prefixes.get(prefix)) errors.push(`${owner}: prefix ${JSON.stringify(prefix)} has index offsets, unsupported`);
}

for (const [map, list, label] of [[GEMARA_EN, SHAS, 'SHAS_TRACTATES'], [TANAKH_EN, TANAKH, 'TANAKH_BOOKS']]) {
  for (const title of list) if (!map[title]) errors.push(`${label}: ${title} has no English name`);
  for (const [he, en] of Object.entries(map)) {
    if (!heTitles.has(he)) errors.push(`${he}: not a Sefaria title, so links to it must not carry ref_2`);
    checkPrefix(`${en} `, he);
  }
}

const LETTERS = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400 };
function heNumber(text) {
  const letters = text.replace(/['"׳״]/g, '');
  if (!letters) return null;
  let total = 0;
  for (const ch of letters) {
    if (!LETTERS[ch]) return null;
    total += LETTERS[ch];
  }
  return total;
}

/** heRef components after the book (and node) name -> address; the first is a daf when isDaf. */
function parseAddress(parts, isDaf) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (i === 0 && isDaf) {
      const m = part.match(/^(\S+?)([.:])$/);
      const n = m && heNumber(m[1]);
      if (!n) return null;
      out.push(n * 2 - (m[2] === '.' ? 1 : 0));
    } else {
      const n = heNumber(part);
      if (!n) return null;
      out.push(n);
    }
  }
  return out;
}

const b36 = n => n.toString(36);

/** Mirrors lineSignature + segmentHash in src/utils/sefariaRefs.ts, over the extracted signatures. */
const signatureOf = sig => (typeof sig === 'number' ? 'L' + sig : 'H' + sig.slice(sig.indexOf(':') + 1).replace(/[^\u05d0-\u05ea.:]/g, ''));
function segmentHash(signatures) {
  let h = 0x811c9dc5;
  const text = signatures.join(',');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 46656).toString(36).padStart(3, '0');
}

/** `segments`: [{ start, hash }] — each segment's tokens follow its `|hash`, and no run crosses it. */
function encode(lines, segments) {
  const out = [];
  const hashAt = new Map(segments.map(seg => [seg.start, seg.hash]));
  const ends = [...segments.slice(1).map(seg => seg.start), lines.length];
  let segment = -1;
  let prev = null;
  let node = 0;
  let i = 0;
  const isNext = (a, p) => p && a && a.node === node && a.address.length === p.length
    && a.address.slice(0, -1).every((v, j) => v === p[j]) && a.address[p.length - 1] === p[p.length - 1] + 1;
  while (i < lines.length) {
    if (hashAt.has(i)) {
      out.push('|' + hashAt.get(i));
      segment++;
    }
    const end = ends[segment];
    const cur = lines[i];
    if (!cur) {
      let j = i;
      while (j < end && !lines[j]) j++;
      out.push('.' + (j - i > 1 ? b36(j - i) : ''));
      i = j;
      continue;
    }
    if (cur.node !== node) {
      out.push('#' + b36(cur.node));
      node = cur.node;
      prev = null;
    }
    if (isNext(cur, prev)) {
      let j = i;
      let p = prev;
      while (j < end && isNext(lines[j], p)) { p = lines[j].address; j++; }
      out.push('+' + (j - i > 1 ? b36(j - i) : ''));
      prev = p;
      i = j;
      continue;
    }
    const a = cur.address;
    let token = null;
    if (prev && prev.length === a.length) {
      for (let level = 0; level < a.length - 1; level++) {
        if (a.slice(0, level).every((v, j) => v === prev[j]) && a[level] > prev[level]) {
          const lower = a.slice(level + 1);
          while (lower.length && lower[lower.length - 1] === 1) lower.pop();
          const k = a.length - 1 - level;
          const delta = a[level] - prev[level];
          token = k === 1 && !lower.length && delta <= 26
            ? String.fromCharCode(64 + delta)
            : '^'.repeat(k) + b36(delta) + lower.map(v => ':' + b36(v)).join('');
          break;
        }
      }
    }
    out.push(token ?? '=' + a.map(b36).join(':'));
    prev = a;
    i++;
  }
  return out.join('');
}

/** Mirror of decodeBaked in src/utils/sefariaRefs.ts, used only to self-check the output. */
function decode(refs) {
  const out = [];
  const segments = [];
  let node = 0;
  let prev = null;
  const emit = address => { out.push({ node, address }); prev = address; };
  for (const [, op, arg] of refs.matchAll(/([.+=#|]|\^+|[A-Z])([0-9a-z:]*)/g)) {
    if (op === '|') { segments.push({ start: out.length, hash: arg }); continue; }
    const values = arg ? arg.split(':').map(v => parseInt(v, 36)) : [];
    if (op === '.') for (let i = 0; i < (values[0] || 1); i++) out.push(null);
    else if (op === '#') { node = values[0]; prev = null; }
    else if (op === '=') emit(values);
    else if (op === '+') for (let i = 0; i < (values[0] || 1); i++) { const n = [...prev]; n[n.length - 1]++; emit(n); }
    else {
      const k = op[0] === '^' ? op.length : 1;
      const delta = op[0] === '^' ? values[0] : op.charCodeAt(0) - 64;
      const lower = op[0] === '^' ? values.slice(1) : [];
      const level = prev.length - 1 - k;
      const n = [...prev.slice(0, level), prev[level] + delta];
      while (n.length < prev.length) n.push(lower[n.length - level - 1] ?? 1);
      emit(n);
    }
  }
  return { lines: out, segments };
}

const db = new DatabaseSync(DB, { readOnly: true });
// Prepared per call: a statement held across the loop is finalized once `db` looks unused to the GC.
const findBook = { get: title => db.prepare('SELECT id, totalLines FROM book WHERE title = ?').get(title) };
const readRefs = { all: id => db.prepare('SELECT lineIndex, heRef FROM line WHERE bookId = ? ORDER BY lineIndex').all(id) };

/** title -> { nodes: [[en, he, isDaf]], isDaf } for every book that gets a table entry */
const books = [];
for (const t of SHAS) {
  books.push({ title: RASHI + t, nodes: [['', `Rashi on ${GEMARA_EN[t]} `]], isDaf: true });
  books.push({ title: TOSAFOT + t, nodes: [['', `Tosafot on ${GEMARA_EN[t]} `]], isDaf: true });
}
for (const t of TANAKH) books.push({ title: RASHI + t, nodes: [['', `Rashi on ${TANAKH_EN[t]} `]], isDaf: false });
for (const t of HALACHA) {
  if (!HALACHA_NODES[t]) { errors.push(`${t}: no Sefaria nodes declared in this script`); continue; }
  books.push({ title: t, nodes: HALACHA_NODES[t], isDaf: false });
}

const table = [];
let totalLines = 0;
let totalRefs = 0;
for (const book of books) {
  // A link to a book Sefaria does not own must not carry ref_2, so such a book gets no entry.
  if (!heTitles.has(book.title)) { console.log(`sefaria-refs: skip ${book.title} (not a Sefaria title)`); continue; }
  const meta = findBook.get(book.title);
  if (!meta) { console.log(`sefaria-refs: skip ${book.title} (not in the library)`); continue; }
  for (const [, en] of book.nodes) checkPrefix(en, book.title);

  const rows = readRefs.all(meta.id);
  if (rows.length !== meta.totalLines || rows.some((r, i) => r.lineIndex !== i)) {
    errors.push(`${book.title}: line rows are not 0..${meta.totalLines - 1}`);
    continue;
  }
  const heads = book.nodes.map(([name]) => (name ? `${book.title}, ${name}, ` : `${book.title}, `));
  const lines = rows.map(({ heRef }) => {
    if (!heRef) return null;
    const ref = heRef.replace(/״/g, '"');
    // The longest head first: a node's name follows the book's own.
    const order = heads.map((h, i) => i).sort((x, y) => heads[y].length - heads[x].length);
    const node = order.find(i => ref.startsWith(heads[i]));
    const address = node === undefined ? null : parseAddress(ref.slice(heads[node].length).split(','), book.isDaf);
    if (!address) { errors.push(`${book.title}: cannot parse heRef ${heRef}`); return null; }
    return { node, address };
  });
  const sigs = signatures[book.title];
  if (!sigs || sigs.length !== rows.length) {
    errors.push(`${book.title}: line-signatures.json is stale (re-run extract-sefaria-signatures.py)`);
    continue;
  }
  const starts = sigs.map((sig, i) => (i === 0 || typeof sig === 'string' ? i : -1)).filter(i => i >= 0);
  const segments = starts.map((start, k) => ({
    start,
    hash: segmentHash(sigs.slice(start, starts[k + 1] ?? sigs.length).map(signatureOf)),
  }));
  sigs.forEach((sig, i) => {
    if (typeof sig === 'string' && lines[i]) errors.push(`${book.title}: header line ${i + 1} has a heRef`);
  });
  const depths = new Map();
  for (const l of lines) {
    if (!l) continue;
    if ((depths.get(l.node) ?? l.address.length) !== l.address.length) errors.push(`${book.title}: mixed address depths`);
    depths.set(l.node, l.address.length);
  }

  const refs = encode(lines, segments);
  const { lines: roundTrip, segments: roundSegments } = decode(refs);
  if (roundTrip.length !== lines.length || lines.some((l, i) => JSON.stringify(l) !== JSON.stringify(roundTrip[i]))
    || JSON.stringify(roundSegments) !== JSON.stringify(segments)) {
    throw new Error(`${book.title}: round-trip mismatch`);
  }
  const nodes = book.nodes.map(([name, en]) => [en, name ? `${book.title}, ${name} ` : `${book.title} `, book.isDaf ? 1 : 0]);
  table.push({ title: book.title, nodes, refs });
  totalLines += rows.length;
  totalRefs += lines.filter(Boolean).length;
}

// Commentaries `<X> על <base>` that are themselves Sefaria books: their links would need ref_1.
const bases = [...SHAS, ...Object.keys(TANAKH_EN).filter(t => !SHAS.includes(t)), ...HALACHA];
const commentators = new Map();
for (const title of heTitles) {
  const at = title.lastIndexOf(' על ');
  if (at < 0) continue;
  const base = bases.indexOf(title.slice(at + 4));
  if (base < 0) continue;
  const name = title.slice(0, at);
  if (!commentators.has(name)) commentators.set(name, []);
  commentators.get(name).push(base);
}

if (errors.length) {
  console.error(errors.slice(0, 30).join('\n'));
  if (errors.length > 30) console.error(`… and ${errors.length - 30} more`);
  process.exit(1);
}

const entries = table
  .map(b => `  ${JSON.stringify(b.title)}: {\n    nodes: ${JSON.stringify(b.nodes)},\n    refs: ${JSON.stringify(b.refs)},\n  },`)
  .join('\n');
const commentatorEntries = [...commentators]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([name, list]) => `  ${JSON.stringify(name)}: ${JSON.stringify(list.sort((a, b) => a - b).map(b36).join(','))},`)
  .join('\n');

const output = `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`node scripts/generate-sefaria-refs.mjs\` (wired into \`npm run build\`).
 *
 * Sefaria address of every line of the commentaries and halacha books the plugin links to,
 * read from the library's heRef column. ${totalRefs.toLocaleString('en-US')} addressed lines out of
 * ${totalLines.toLocaleString('en-US')}. See src/utils/sefariaRefs.ts for the decoder and the
 * generator's header for the encoding.
 */
export const SEFARIA_REF_TABLE: Record<string, {
  /** per node: [English ref prefix, Hebrew heRef prefix, 1 when the first number is a daf] */
  nodes: [string, string, number][];
  refs: string;
}> = {
${entries}
};

/** Base books of SEFARIA_COMMENTATORS, indexed by its base36 numbers. */
export const SEFARIA_COMMENTARY_BASES: string[] = ${JSON.stringify(bases)};

/** Commentator -> the bases (into SEFARIA_COMMENTARY_BASES) on which \`<commentator> על <base>\` is a Sefaria title. */
export const SEFARIA_COMMENTATORS: Record<string, string> = {
${commentatorEntries}
};
`;

fs.writeFileSync(outFile, output, 'utf8');
console.log(`sefaria-refs: ${table.length} books, ${totalRefs.toLocaleString('en-US')} refs, ${commentators.size} commentators`);
console.log(`sefaria-refs: wrote ${(output.length / 1024).toFixed(0)}KB to ${path.relative(projectRoot, outFile)}`);
