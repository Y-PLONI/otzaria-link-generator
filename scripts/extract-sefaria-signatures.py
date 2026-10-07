"""Writes data/sefaria/line-signatures.json for scripts/generate-sefaria-refs.mjs (needs `zstandard`).
Format and purpose: docs/DOUBLE_LINKS_AND_REVERSE_EXPORT.md, section 9.1."""
import json
import os
import re
import sys
import unicodedata

from library_db import open_library

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


def strip_markup(text):
    if '<' not in text:
        return text
    stripped = MARKUP_RUN.sub(lambda m: ' ' if BR.search(m.group(0)) else '', text)
    return re.sub(r'[^\S\n]{2,}', ' ', stripped).strip()


def normalized(text):
    text = re.sub(r'<[^>]*>', '', text)
    text = unicodedata.normalize('NFD', text)
    text = re.sub(r'[\u0591-\u05c7\u200e\u200f\u202a-\u202e\u2066-\u2069]', '', text)
    text = ''.join(ch for ch in text if unicodedata.category(ch)[0] in 'LN' or ch in '.:' or ch.isspace())
    return re.sub(r'\s+', ' ', text).strip()


def signature(line):
    trimmed = line.strip()
    if HEADER_HTML_ANY.search(trimmed):
        m = HEADER_HTML.search(trimmed)
        return f'H{m.group(1)}:{normalized(strip_markup(m.group(2)))}'
    m = HEADER_MD.match(trimmed)
    if m:
        return f'H{len(m.group(1))}:{normalized(strip_markup(m.group(2)))}'
    return 'L' + normalized(strip_markup(line))


def signature_hash(signatures):
    first, second = 0x811c9dc5, 0x9e3779b9
    raw = '\n'.join(signatures).encode('utf-16-le', errors='surrogatepass')
    for offset in range(0, len(raw), 2):
        ch = raw[offset] | (raw[offset + 1] << 8)
        first = ((first ^ ch) * 0x01000193) & 0xffffffff
        second = ((second ^ ch) * 0x85ebca6b) & 0xffffffff
    return f'{first:08x}{second:08x}'


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
    titles = shas + tanakh + [RASHI + t for t in shas + tanakh] + [TOSAFOT + t for t in shas] + halacha + commentator_titles()

    db, read_lines = open_library(DB)

    out = {}
    ref_signatures = {}
    for title in titles:
        book = db.execute('SELECT id FROM book WHERE title = ?', (title,)).fetchone()
        if not book:
            continue
        lines = read_lines(book[0])
        refs = [row[0] or '' for row in db.execute('SELECT heRef FROM line WHERE bookId = ? ORDER BY lineIndex', (book[0],))]
        if len(lines) != len(refs):
            sys.exit(f'{title}: content/reference line count mismatch')
        out[title] = [signature(line) for line in lines]
        ref_signatures[title] = signature_hash(refs)
    db.close()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump({'version': 2, 'books': out, 'refSignatures': ref_signatures}, fh, ensure_ascii=False)
    print(f'{len(out)} books, {sum(len(v) for v in out.values())} lines -> {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
