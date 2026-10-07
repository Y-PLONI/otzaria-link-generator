/** Real component regression: a large linked group or pending inheritance chain stays bounded. */
import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditMode } from '../src/components/EditMode';
import { MAX_GROUP_LINES, RENDER_WINDOW_SIZE } from '../src/utils/renderWindow';
import type { SessionState } from '../src/types';
(globalThis as any).window = { innerHeight: 800 };
const count = 3000;
const config = { sourceCategory: 'shas', targetBookName: 'ברכות', ignoreShamInShas: true, diburHamatchilDelimiter: '.' } as const;
for (const mode of ['different', 'same', 'pending', 'unlinked'] as const) {
  const session = {
    id: 'render', config, commentaryLines: Array.from({ length: count }, (_, i) =>
      mode === 'pending' && i > 0 ? 'בא"ד המשך הדברים' : 'אמר רבי אבא דברי התורה בפירוש'),
    sourceLines: Array.from({ length: count }, () => 'אמר רבי אבא דברי התורה'),
    links: mode === 'pending' || mode === 'unlinked' ? [] : Array.from({ length: count }, (_, i) => ({
      line_index_1: i + 1, line_index_2: mode === 'same' ? 1 : i + 1, heRef_2: 'x', path_2: 'ברכות.txt',
      connection_type: 'commentary', dhText: 'אמר רבי אבא', confidence: 100, status: 'approved'
    })), dhHighlights: {}
  } as SessionState;
  const start = performance.now();
  const html = renderToStaticMarkup(<EditMode session={session} onUpdateSession={() => {}} />);
  const rows = (html.match(/id="comm-box-/g) || []).length;
  assert(rows > 0 && rows <= RENDER_WINDOW_SIZE * MAX_GROUP_LINES, `${mode}: mounted ${rows} rows`);
  assert(html.includes('comm-box-1'), 'the first line is reachable');
  console.log(`PASS render ${mode}: ${rows}/${count} rows, ${Math.round(performance.now() - start)}ms`);
}
