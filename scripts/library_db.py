"""Read-only access to plain or dictionary-compressed Otzaria book lines."""
import sqlite3
import zstandard


def open_library(path):
    db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    columns = {row[1] for row in db.execute('PRAGMA table_info(line)')}
    if 'content' in columns:
        return db, lambda book_id: [row[0] for row in db.execute(
            'SELECT content FROM line WHERE bookId = ? ORDER BY lineIndex', (book_id,))]
    dicts = {}
    for _, blob in db.execute('SELECT id, dict FROM zstd_dict'):
        dictionary = zstandard.ZstdCompressionDict(blob)
        dicts[dictionary.dict_id()] = zstandard.ZstdDecompressor(dict_data=dictionary)
    plain = zstandard.ZstdDecompressor()

    def decode(content):
        if isinstance(content, str):
            return content
        dict_id = zstandard.get_frame_parameters(content).dict_id
        return (dicts[dict_id] if dict_id else plain).decompress(content, max_output_size=10_000_000).decode('utf-8')

    def lines(book_id):
        return [decode(row[0]) for row in db.execute(
            'SELECT c.content FROM line l JOIN line_content c ON c.id = l.id WHERE l.bookId = ? ORDER BY l.lineIndex',
            (book_id,))]
    return db, lines
