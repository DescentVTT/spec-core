import { describe, expect, it } from 'vitest';

import { scanMarkdown, type Table } from '../../src/markdown/index.js';

const doc = (...lines: string[]): string => lines.join('\n');
const tables = (text: string): readonly Table[] => scanMarkdown(text).tables;
/** Each table as its header cells and its rows' cells. */
const cells = (text: string): string[][][] => tables(text).map((t) => [t.headers.map((c) => c.text), ...t.rows.map((r) => r.cells.map((c) => c.text))]);

describe('pipe tables', () => {
  it('reads the header, the rows and an offset for every cell', () => {
    const text = doc('| Id | Title |', '|----|:-----:|', '| 1  | One   |', '| 2 | Two |', '', 'after');
    expect(tables(text)).toEqual([
      {
        start: 0,
        end: 56,
        line: 1,
        endLine: 4,
        headers: [
          { text: 'Id', start: 2, end: 4 },
          { text: 'Title', start: 7, end: 12 },
        ],
        rows: [
          { cells: [{ text: '1', start: 32, end: 33 }, { text: 'One', start: 37, end: 40 }], start: 30, end: 44, line: 3 },
          { cells: [{ text: '2', start: 47, end: 48 }, { text: 'Two', start: 51, end: 54 }], start: 45, end: 56, line: 4 },
        ],
      },
    ]);
  });

  it('reads rows without border pipes, and a table with no rows', () => {
    expect(cells(doc('a | b', '--- | ---', '1 | 2'))).toEqual([[['a', 'b'], ['1', '2']]]);
    expect(tables(doc('| a |', '| - |'))).toMatchObject([{ line: 1, endLine: 2, end: 11, rows: [] }]);
  });

  it('treats a pipe opening an indented row as a border', () => {
    expect(cells(doc('  | a | b |', '  |---|---|', '  | 1 | 2 |'))).toEqual([[['a', 'b'], ['1', '2']]]);
  });

  it('keeps an escaped pipe, and a pipe in code or a comment, inside its cell', () => {
    expect(cells(doc('| a \\| b | `c|d` | e <!-- | --> |', '|---|---|---|'))).toEqual([[['a \\| b', '`c|d`', 'e <!-- | -->']]]);
  });

  it('keeps an empty cell in the middle of a row', () => {
    expect(cells(doc('| a | b |', '|---|---|', '| | x |'))).toEqual([[['a', 'b'], ['', 'x']]]);
    expect(cells(doc('| a | b |  ', '|---|---|\t', '| 1 | 2 |   '))).toEqual([[['a', 'b'], ['1', '2']]]);
  });

  it('needs a delimiter row of dashes and colons with as many cells as the header', () => {
    expect(tables(doc('| a | b |', '|---|---|---|'))).toEqual([]);
    expect(tables(doc('| a | b |', '|---|-x-|'))).toEqual([]);
    expect(tables(doc('| a | b |', '|---| : |'))).toEqual([]);
    expect(tables(doc('| a | b |', '--- ---'))).toEqual([]);
    expect(tables(doc('a b', '---|---'))).toEqual([]);
    expect(cells(doc('| a | b |', '|:--|--:|'))).toEqual([[['a', 'b']]]);
  });

  it('ends at a blank line, a line with no pipe, code, a heading, or a comment', () => {
    const header = ['| a |', '|---|', '| 1 |'];
    for (const end of ['', 'text', '```', '# H |', '<!-- | -->']) {
      expect(tables(doc(...header, end, '| 2 |'))[0]?.rows, JSON.stringify(end)).toHaveLength(1);
    }
  });

  it('is not one in code, in a comment, on a heading, or where a span runs in from above', () => {
    expect(tables(doc('```', '| a |', '|---|', '```'))).toEqual([]);
    expect(tables(doc('<!--', '| a |', '|---|', '-->'))).toEqual([]);
    expect(tables(doc('# a | b', '--|--'))).toEqual([]);
    expect(tables(doc('x `y', 'z` | a |', '|---|---|'))).toEqual([]);
    expect(tables(doc('| `a|b` |', '|---|---|'))).toEqual([]);
  });

  it('reads a table in a block quote', () => {
    expect(cells(doc('> | a |', '> |---|', '> | 1 |'))).toEqual([[['a'], ['1']]]);
  });
});
