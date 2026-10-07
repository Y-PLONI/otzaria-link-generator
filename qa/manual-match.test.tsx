import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditLinkModal } from '../src/components/EditLinkModal';
import assert from 'node:assert/strict';
import { parseDocumentSegments } from '../src/utils/parserAlgorithm';
import { profileForConfig } from '../src/utils/halachaAlgorithm';
import { manualMatchingSegment, manualSegmentRanges } from '../src/utils/manualMatch';
const profile = profileForConfig({ sourceCategory: 'halacha', halachaMultiLinePieces: false });
const lines = ['<h2>סימן א</h2>', '<h3>סעיף א</h3>', 'תחילה', '<h2>סימן ב</h2>', '<h3>סעיף א</h3>', 'סוף'];
const segments = parseDocumentSegments(lines.join('\n'), profile).segments;
const ranges = manualSegmentRanges(segments, profile);
const match = manualMatchingSegment(ranges, segments, 6, profile);
assert.equal(match?.headerTitle, 'סימן ב');
assert.equal(match?.endLine, 6);
assert.equal(ranges[0].endLine, 3);
assert.equal(manualMatchingSegment(ranges, segments, 3, profile)?.headerTitle, 'סימן א');
console.log('PASS manual matching preserves siman context and includes seif subheadings');

const html = renderToStaticMarkup(<EditLinkModal commLineIndex={6} commLineText="שך דה סוף" commentaryLines={lines}
  sourceLinesCount={6} sourceLines={lines} isShas={false} profile={profile} onSave={() => {}} onClose={() => {}}
  currentLink={{ line_index_1: 6, line_index_2: 6, heRef_2: 'x', path_2: 'x.txt', connection_type: 'commentary', secondaryTarget: 'shach', secondary_line_index: 6 }}
  otherSecondaries={[{ id: 'shach', label: 'שך', lines }]} />);
assert(html.includes('data-line-card="shach-6"'));
assert(!html.includes('data-line-card="shach-3"'));
console.log('PASS manual modal first render shows the containing siman');
