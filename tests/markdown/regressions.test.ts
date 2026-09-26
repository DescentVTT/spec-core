/**
 * The three defects of the scanners this one replaces, each reproduced on the
 * old scanner and shown gone from the new one.
 */

import { describe, expect, it } from 'vitest';

import { scanMarkdown } from '../../src/markdown/index.js';
import { scan as briefScan } from './reference/spec-brief/markdown.js';
import { scanMarkdown as graphScan } from './reference/spec-graph/markdown.js';
import { maskCode } from './reference/spec-guard/parser.js';

const doc = (...lines: string[]): string => lines.join('\n');

describe('a heading inside an HTML comment', () => {
  const text = doc('# Title', '', '<!--', '## Hidden', '- [ ] hidden task', '| a | b |', '|---|---|', '-->', '', '## Shown');

  it('was read as a heading by spec-graph', () => {
    expect(graphScan(text).headings.map((h) => h.text)).toEqual(['Title', 'Hidden', 'Shown']);
    expect(graphScan(text).listItems).toHaveLength(1);
  });

  it('is not a heading, and nothing else in the comment is structure', () => {
    const s = scanMarkdown(text);
    expect(s.headings.map((h) => h.text)).toEqual(['Title', 'Shown']);
    expect(s.listItems).toEqual([]);
    expect(s.tables).toEqual([]);
    expect(s.lines.filter((l) => l.comment).map((l) => l.line)).toEqual([3, 4, 5, 6, 7, 8]);
  });
});

describe('a code span holding <!--', () => {
  const text = doc('Use `<!--` to open a comment.', '', '## Visible', '', 'See [the spec](spec.md).', '', 'and `-->` to close one.');

  it('opened a comment in spec-graph that swallowed everything to the next -->', () => {
    const old = graphScan(text);
    expect(old.comments).toHaveLength(1);
    expect(old.links).toEqual([]);
  });

  it('is code, so the heading and the link after it are found', () => {
    const s = scanMarkdown(text);
    expect(s.comments).toEqual([]);
    expect(s.codeSpans.map((r) => text.slice(r.start, r.end))).toEqual(['`<!--`', '`-->`']);
    expect(s.headings.map((h) => h.text)).toEqual(['Visible']);
    expect(s.links.map((l) => l.target)).toEqual(['spec.md']);
  });

  it('and a comment opened first keeps a backtick inside it as text', () => {
    const s = scanMarkdown(doc('<!-- a ` b -->', 'c ` d'));
    expect(s.comments).toHaveLength(1);
    expect(s.codeSpans).toEqual([]);
  });
});

describe('code fences spec-guard read wrongly', () => {
  const directive = '<!-- @assert-absence target="src/" symbol="X" -->';

  it('opened a fence on a backtick info string holding a backtick, hiding the directive after it', () => {
    const text = doc('```js`x', directive);
    expect(maskCode(text).includes('@assert-absence')).toBe(false);
    const s = scanMarkdown(text);
    expect(s.blocks).toEqual([]);
    expect(s.masks.directives.includes('@assert-absence')).toBe(true);
  });

  it('closed a fence on a line carrying an info string', () => {
    const text = doc('```', 'code', '```js', directive, '```');
    expect(maskCode(text).includes('@assert-absence')).toBe(true);
    const s = scanMarkdown(text);
    expect(s.blocks).toMatchObject([{ line: 1, endLine: 5, closed: true }]);
    expect(s.masks.directives.includes('@assert-absence')).toBe(false);
  });

  it('missed a fence nested in a list item, and read its example as a directive', () => {
    // With backticks the fence lines paired as a code span and hid it by luck.
    const text = doc('- Example:', '', '      ~~~md', `      ${directive}`, '      ~~~');
    expect(maskCode(text).includes('@assert-absence')).toBe(true);
    const s = scanMarkdown(text);
    expect(s.blocks).toMatchObject([{ kind: 'fenced', line: 3, endLine: 5 }]);
    expect(s.masks.directives.includes('@assert-absence')).toBe(false);
  });

  it('agrees with spec-brief, which read all three as CommonMark does', () => {
    const lines = doc('```js`x', '# a', '```', 'x', '```js', '# b', '```', '- i', '      ```', '      # c', '      ```', '# d').split('\n');
    expect(briefScan(lines).headings.map((h) => h.text)).toEqual(['a', 'd']);
    expect(scanMarkdown(lines.join('\n')).headings.map((h) => h.text)).toEqual(['a', 'd']);
  });
});
