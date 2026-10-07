/** Ignore presentation while retaining words, word boundaries, numbers and address punctuation. */
export function normalizeRefText(text) {
  return text.replace(/<\s*br\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, '').normalize('NFD')
    .replace(/[\u0591-\u05c7\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[^\p{L}\p{N}.:\s]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Two independent 32-bit accumulators; shared by runtime and both table generators. */
export function segmentHash(signatures) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const text = signatures.join('\n');
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    first = Math.imul(first ^ ch, 0x01000193);
    second = Math.imul(second ^ ch, 0x85ebca6b);
  }
  return (first >>> 0).toString(16).padStart(8, '0') + (second >>> 0).toString(16).padStart(8, '0');
}

/** Include ancestor headings: an identical סעיף in another סימן is a different segment. */
export function refSegments(signatures) {
  const starts = [0];
  for (let i = 1; i < signatures.length; i++) if (signatures[i].startsWith('H')) starts.push(i);
  let parents = [];
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? signatures.length;
    const heading = signatures[start]?.match(/^H([1-6]):/);
    if (heading) {
      const level = Number(heading[1]);
      parents = parents.slice(0, level);
      parents[level - 1] = signatures[start];
    }
    return { start, end, hash: segmentHash(['@context', ...parents.filter(Boolean), ...signatures.slice(start, end)]) };
  });
}

/** Identity of the content AND physical-line references used by both generated tables. */
export function bookSignature(signatures, referenceSignature) {
  return segmentHash(['v2', segmentHash(signatures), referenceSignature]);
}
