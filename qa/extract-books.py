"""Exact book text for QA, supporting the compressed Otzaria database. Requires zstandard."""
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from library_db import open_library

BOOKS = {
    'py_berachot': 'פני יהושע על ברכות',
    'gem_berachot': 'ברכות',
    'rashi_berachot': 'רש"י על ברכות',
    'tos_berachot': 'תוספות על ברכות',
    'py_shabbat': 'פני יהושע על שבת',
    'gem_shabbat': 'שבת',
    'rashi_shabbat': 'רש"י על שבת',
    'tos_shabbat': 'תוספות על שבת',
    'benyehoyada_berachot': 'בן יהוידע על ברכות',
}
DB = os.environ.get('OTZARIA_DB') or str(Path.home() / 'AppData/Roaming/otzaria/books/seforim.db')
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'qa/data'
out.mkdir(parents=True, exist_ok=True)
db, read_lines = open_library(DB)
for name, title in BOOKS.items():
    book = db.execute('SELECT id, totalLines FROM book WHERE title = ?', (title,)).fetchone()
    if not book:
        sys.exit(f'Missing fixture: {title}')
    lines = read_lines(book[0])
    if len(lines) != book[1]:
        sys.exit(f'{title}: line count mismatch')
    with (out / f'{name}.txt').open('w', encoding='utf-8', newline='\n') as file:
        file.write('\n'.join(lines))
    print(f'{name}: {len(lines)} lines')
db.close()
