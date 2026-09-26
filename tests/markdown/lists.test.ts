import { describe, expect, it } from 'vitest';

import { scanMarkdown } from '../../src/markdown/index.js';

const doc = (...lines: string[]): string => lines.join('\n');
/** Each item as [line, last line, depth, first line]. */
const items = (text: string): [number, number, number, string][] =>
  scanMarkdown(text).listItems.map((i) => [i.line, i.endLine, i.depth, i.firstLine]);

describe('list items', () => {
  it('reads the marker, the checkbox and the text, with their offsets', () => {
    const text = doc('intro', '  - [x]  Ship it', '  more');
    expect(scanMarkdown(text).listItems).toEqual([
      {
        start: 6,
        end: 29,
        markerStart: 8,
        marker: '-',
        textStart: 15,
        checkbox: 'x',
        checkboxStart: 10,
        firstLine: 'Ship it',
        body: 'Ship it\n  more',
        maskedBody: 'Ship it\n  more',
        line: 2,
        endLine: 3,
        depth: 0,
        indent: 2,
        quoteDepth: 0,
      },
    ]);
  });

  it('reads every marker form, an empty item included', () => {
    const s = scanMarkdown(doc('- a', '* b', '+ c', '1. d', '22) e', '-'));
    expect(s.listItems.map((i) => [i.marker, i.firstLine])).toEqual([
      ['-', 'a'],
      ['*', 'b'],
      ['+', 'c'],
      ['1.', 'd'],
      ['22)', 'e'],
      ['-', ''],
    ]);
  });

  it('reads the character in a checkbox and leaves its meaning to the caller', () => {
    const boxes = scanMarkdown(doc(...[' ', 'x', 'X', '~', '-', '?', '!', '*', '/', '+'].map((c) => `- [${c}] t`))).listItems;
    expect(boxes.map((i) => i.checkbox)).toEqual([' ', 'x', 'X', '~', '-', '?', '!', '*', '/', '+']);
    expect(boxes.every((i) => i.firstLine === 't')).toBe(true);
    expect(scanMarkdown('- [x]').listItems[0]).toMatchObject({ checkbox: 'x', firstLine: '' });
    expect(scanMarkdown('- [x]\t done  ').listItems[0]).toMatchObject({ checkbox: 'x', firstLine: 'done', textStart: 7 });
  });

  it('does not read a checkbox that is text, or in code', () => {
    for (const line of ['- [a] t', '- [x]t', '- [ ]] t', '- `[ ]` t', '- [[ ]] t', '- x [ ] t']) {
      expect(scanMarkdown(line).listItems[0]?.checkbox, line).toBeNull();
    }
  });

  it('nests by indentation and counts the items around each', () => {
    expect(items(doc('- a', '  - b', '    - c', '  - d', '- e'))).toEqual([
      [1, 4, 0, 'a'],
      [2, 3, 1, 'b'],
      [3, 3, 2, 'c'],
      [4, 4, 1, 'd'],
      [5, 5, 0, 'e'],
    ]);
  });

  it('owns lazy continuation lines, and not a line after a blank one', () => {
    expect(items(doc('- a', 'lazy', 'more', '', 'para'))).toEqual([[1, 3, 0, 'a']]);
  });

  it('owns nested content after blank lines, and stops at a line no deeper than its marker', () => {
    expect(items(doc('- a', '', '  nested', '', '  more', '', 'para'))).toEqual([[1, 5, 0, 'a']]);
    expect(items(doc('  - a', '', '  b'))).toEqual([[1, 1, 0, 'a']]);
  });

  it('stops at a line that opens something of its own', () => {
    expect(items(doc('- a', '---'))).toEqual([[1, 1, 0, 'a']]);
    expect(items(doc('- a', '> quote'))).toEqual([[1, 1, 0, 'a']]);
    expect(items(doc('- a', '```', 'code', '```'))).toEqual([[1, 1, 0, 'a']]);
    expect(items(doc('- a', '<pre>', 'x', '</pre>'))).toEqual([[1, 1, 0, 'a']]);
    expect(items(doc('- a', '- b'))).toEqual([
      [1, 1, 0, 'a'],
      [2, 2, 0, 'b'],
    ]);
  });

  it('stops at a heading, however deep it is indented', () => {
    expect(items(doc('- a', '  # H', '  - b'))).toEqual([
      [1, 1, 0, 'a'],
      [3, 3, 0, 'b'],
    ]);
    expect(items(doc('- a', 'Title', '---', 'b'))).toEqual([[1, 1, 0, 'a']]);
  });

  it('owns a nested fence whole, whatever the indentation of its lines', () => {
    const s = scanMarkdown(doc('- a', '  ```', 'code at column 0', '  ```', '- b'));
    expect(s.listItems.map((i) => [i.line, i.endLine])).toEqual([
      [1, 4],
      [5, 5],
    ]);
    expect(s.listItems[0]?.maskedBody.trim()).toBe('a');
    // A line under the block, with no blank line between, continues the item.
    expect(items(doc('- a', '  ```', '  x', '  ```', 'lazy'))).toEqual([[1, 5, 0, 'a']]);
  });

  it('owns a quote nested under it, and is ended by one beside it', () => {
    expect(items(doc('- a', '  > quoted', '- b'))).toEqual([
      [1, 2, 0, 'a'],
      [3, 3, 0, 'b'],
    ]);
    expect(items(doc('> - a', '> lazy', 'lazier', '>', '> b'))).toEqual([[1, 3, 0, 'a']]);
    expect(items(doc('> - a', '>   > nested'))).toEqual([[1, 2, 0, 'a']]);
    expect(items(doc('> - a', '> > beside'))).toEqual([[1, 1, 0, 'a']]);
    const s = scanMarkdown(doc('> - a', '>   - b'));
    expect(s.listItems.map((i) => [i.quoteDepth, i.depth, i.indent])).toEqual([
      [1, 0, 0],
      [1, 1, 2],
    ]);
  });

  it('keeps code and comments out of the masked body', () => {
    const s = scanMarkdown(doc('- a `x` <!-- y -->', '  ```', '  - [ ] not an item', '  ```'));
    expect(s.listItems).toHaveLength(1);
    expect(s.listItems[0]?.body).toContain('not an item');
    expect(s.listItems[0]?.maskedBody).not.toContain('not an item');
    expect(s.listItems[0]?.maskedBody.startsWith('a       ')).toBe(true);
  });

  it('is not one in front matter', () => {
    expect(items(doc('---', '- a: 1', '---', '- b'))).toEqual([[4, 4, 0, 'b']]);
  });

  it('is not one in code, in a comment, after a comment, or as a thematic break', () => {
    const text = doc('```', '- a', '```', '<!--', '- b', '-->', '<!-- c --> - d', '- - -', '', '    - e');
    expect(items(text)).toEqual([]);
    // A span cannot hide an item: the item ends the paragraph the span opened in.
    expect(items(doc('x `y', '- z` w'))).toEqual([[2, 2, 0, 'z` w']]);
  });
});
