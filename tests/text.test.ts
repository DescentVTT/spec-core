import { describe, expect, it } from 'vitest';

import {
  createLineIndex,
  inRanges,
  lineEnding,
  lineStarts,
  locate,
  maskRanges,
  mergeRanges,
  splitLines,
  stripBom,
} from '../src/text/index.js';

describe('the line table', () => {
  it('ends a line at LF, CRLF and a lone CR alike', () => {
    expect(lineStarts('a\nb\r\nc\rd')).toEqual([0, 2, 5, 7]);
    expect(lineStarts('a\r\r\nb')).toEqual([0, 2, 4]);
  });

  it('does not count the empty line after a final terminator', () => {
    expect(lineStarts('a\n')).toEqual([0]);
    expect(lineStarts('a\n\n')).toEqual([0, 2]);
    expect(lineStarts('')).toEqual([0]);
  });

  it('answers lines and positions the same for every terminator', () => {
    for (const eol of ['\n', '\r\n', '\r']) {
      const text = ['# Title', '', 'Body text'].join(eol) + eol;
      const index = createLineIndex(text);
      expect(index.lineCount).toBe(3);
      expect(index.lineText(1)).toBe('# Title');
      expect(index.lineText(2)).toBe('');
      expect(index.lineText(3)).toBe('Body text');
      const body = text.indexOf('Body');
      expect(index.positionAt(body + 5)).toEqual({ offset: body + 5, line: 3, column: 6 });
      expect(index.lineEnd(3) - index.lineStart(3)).toBe('Body text'.length);
    }
  });

  it('clamps what lies outside the text', () => {
    const index = createLineIndex('ab\ncd');
    expect(index.lineStart(0)).toBe(0);
    expect(index.lineStart(9)).toBe(3);
    expect(index.lineEnd(9)).toBe(5);
    expect(index.positionAt(-4)).toEqual({ offset: 0, line: 1, column: 1 });
    expect(index.positionAt(99)).toEqual({ offset: 5, line: 2, column: 3 });
  });

  it('strips at most one terminator from a line, never into the line before it', () => {
    const index = createLineIndex('a\r\n\r\nb');
    expect(index.lineText(2)).toBe('');
    expect(index.lineStart(2)).toBe(3);
    expect(index.lineEnd(2)).toBe(3);
  });

  it('locates by bisection at every line boundary', () => {
    const starts = [0, 4, 9];
    expect(locate(starts, 0)).toEqual({ offset: 0, line: 1, column: 1 });
    expect(locate(starts, 3)).toEqual({ offset: 3, line: 1, column: 4 });
    expect(locate(starts, 4)).toEqual({ offset: 4, line: 2, column: 1 });
    expect(locate(starts, 8)).toEqual({ offset: 8, line: 2, column: 5 });
    expect(locate(starts, 9)).toEqual({ offset: 9, line: 3, column: 1 });
    expect(locate(starts, 50)).toEqual({ offset: 50, line: 3, column: 42 });
  });
});

describe('ranges and masks', () => {
  it('merges overlapping and touching ranges, and drops empty ones', () => {
    expect(
      mergeRanges([
        { start: 5, end: 7 },
        { start: 0, end: 2 },
        { start: 2, end: 3 },
        { start: 6, end: 9 },
        { start: 4, end: 4 },
      ]),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 9 },
    ]);
  });

  it('answers membership at both ends of every range', () => {
    const merged = mergeRanges([
      { start: 2, end: 4 },
      { start: 8, end: 10 },
    ]);
    expect([1, 2, 3, 4, 7, 8, 9, 10].map((o) => inRanges(merged, o))).toEqual([
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(inRanges([], 0)).toBe(false);
  });

  it('blanks ranges and keeps every offset and terminator where it was', () => {
    const text = 'keep <!-- a\r\nb --> keep';
    const masked = maskRanges(text, [{ start: 5, end: 18 }]);
    expect(masked).toBe('keep       \r\n      keep');
    expect(masked.length).toBe(text.length);
  });

  it('blanks a surrogate pair as two spaces, so later offsets hold', () => {
    const text = `a\u{1F600}b`;
    expect(maskRanges(text, [{ start: 1, end: 3 }])).toBe('a  b');
  });

  it('clamps ranges past the end and leaves an unmasked text alone', () => {
    expect(maskRanges('abc', [{ start: 1, end: 99 }])).toBe('a  ');
    expect(maskRanges('abc', [])).toBe('abc');
    expect(maskRanges('abc', [{ start: 7, end: 9 }])).toBe('abc');
  });
});

describe('terminators and marks', () => {
  it('strips a byte-order mark and nothing else', () => {
    expect(stripBom('\ufeffabc')).toBe('abc');
    expect(stripBom('abc')).toBe('abc');
  });

  it('reads the terminator a text mostly uses', () => {
    expect(lineEnding('a\r\nb\r\nc\n')).toBe('\r\n');
    expect(lineEnding('a\nb\r\n')).toBe('\n');
    expect(lineEnding('abc')).toBe('\n');
    expect(lineEnding('\nx')).toBe('\n');
  });

  it('splits lines so that joining them gives the text back', () => {
    expect(splitLines('a\r\nb\nc\rd\n')).toEqual(['a', 'b', 'c', 'd', '']);
    expect(splitLines('a\r\nb').join('\r\n')).toBe('a\r\nb');
  });
});
