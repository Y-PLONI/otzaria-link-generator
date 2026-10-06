"""Writes data/sefaria/line-signatures.json, the line shapes scripts/generate-sefaria-refs.mjs
anchors the baked ref table to (see src/utils/sefariaRefs.ts, lineSignature).

    python scripts/extract-sefaria-signatures.py

Per book: one entry per line — a header line as "<level>:<title>", any other line as the count
of Hebrew letters in it. Line text is zstd-compressed in the library database, which Node cannot
read, hence Python. Needs the `zstandard` package; OTZARIA_DB overrides the database location.
"""
import json
import os
import re
import sqlite3
import sys

import zstandard

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ.get('OTZARIA_DB') or os.path.join(os.environ.get('APPDATA', ''), 'otzaria', 'books', 'seforim.db')
OUT = os.path.join(ROOT, 'data', 'sefaria', 'line-signatures.json')

RASHI = 'רש"י על '
TOSAFOT = 'תוספות על '

# Mirrors isHeaderLine / extractHeaderTitle / stripContentMarkup in src/utils/parserAlgorithm.ts.
HEADER_HTML = re.compile(r'<h([1-6])[^>]*>(.*?)</h[1-6]>', re.I)
HEADER_HTML_ANY = re.compile(r'<h[1-6][^>]*>.*</h[1-6]>', re.I)
HEADER_MD = re.compile(r'^(#{1,6})\s+(.*)')
MARKUP_RUN = re.compile(r'(?:<[^>]*>)+')
BR = re.compile(r'<\s*br\b[^>]*>', re.I)
LETTER = re.compile('[א-ת]')


def strip_markup(text):
    if '<' not in text:
        return text
    stripped = MARKUP_RUN.sub(lambda m: ' ' if BR.search(m.group(0)) else '', text)
    return re.sub(r'[^\S\n]{2,}', ' ', stripped).strip()


def signature(line):
    trimmed = line.strip()
    if HEADER_HTML_ANY.search(trimmed):
        m = HEADER_HTML.search(trimmed)
        return f'{m.group(1)}:{strip_markup(m.group(2))}'
    m = HEADER_MD.match(trimmed)
    if m:
        return f'{len(m.group(1))}:{strip_markup(m.group(2))}'
    return len(LETTER.findall(MARKUP_RUN.sub('', line)))


def read_array(name):
    src = open(os.path.join(ROOT, 'src', 'types.ts'), encoding='utf-8').read()
    block = re.search(name + r'\s*=\s*\[([\s\S]*?)\]', src)
    return re.findall(r'"([^"]+)"', block.group(1))


def commentator_titles():
    # The נושאי כלים the generator bakes (COMMENTATOR_NODES in scripts/generate-sefaria-refs.mjs).
    src = open(os.path.join(ROOT, 'scripts', 'generate-sefaria-refs.mjs'), encoding='utf-8').read()
    block = re.search(r'const COMMENTATOR_NODES = \{([\s\S]*?)\n\};', src)
    return re.findall(r"^  '([^']+)': \[", block.group(1), re.M)


def main():
    if not os.path.exists(DB):
        sys.exit(f'library database not found at {DB}; set OTZARIA_DB')
    shas, tanakh, halacha = read_array('SHAS_TRACTATES'), read_array('TANAKH_BOOKS'), read_array('HALACHA_BOOKS')
    titles = [RASHI + t for t in shas + tanakh] + [TOSAFOT + t for t in shas] + halacha + commentator_titles()

    db = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    dicts = {}
    for _, blob in db.execute('SELECT id, dict FROM zstd_dict'):
        d = zstandard.ZstdCompressionDict(blob)
        dicts[d.dict_id()] = zstandard.ZstdDecompressor(dict_data=d)
    plain = zstandard.ZstdDecompressor()

    def decode(content):
        if isinstance(content, str):
            return content
        dict_id = zstandard.get_frame_parameters(content).dict_id
        return (dicts[dict_id] if dict_id else plain).decompress(content, max_output_size=10_000_000).decode('utf-8')

    out = {}
    for title in titles:
        book = db.execute('SELECT id FROM book WHERE title = ?', (title,)).fetchone()
        if not book:
            continue
        rows = db.execute('SELECT c.content FROM line l JOIN line_content c ON c.id = l.id '
                          'WHERE l.bookId = ? ORDER BY l.lineIndex', (book[0],)).fetchall()
        out[title] = [signature(decode(content)) for (content,) in rows]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(out, fh, ensure_ascii=False)
    print(f'{len(out)} books, {sum(len(v) for v in out.values())} lines -> {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
