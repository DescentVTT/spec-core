import { describe, expect, it } from 'vitest';

import { linesOf, scanMarkdown } from '../../src/markdown/index.js';

const doc = (...lines: string[]): string => lines.join('\n');
/** The line numbers of the lines a predicate holds for. */
const where = (text: string, keep: (line: ReturnType<typeof scanMarkdown>['lines'][number]) => boolean): number[] =>
  scanMarkdown(text)
    .lines.filter(keep)
    .map((l) => l.line);
const codeLines = (text: string): number[] => where(text, (l) => l.code);
const spans = (text: string): string[] => {
  const s = scanMarkdown(text);
  return s.codeSpans.map((r) => s.text.slice(r.start, r.end));
};
const comments = (text: string): string[] => scanMarkdown(text).comments.map((c) => c.inner);

describe('front matter', () => {
  it('reads YAML between --- lines, closed by --- or ...', () => {
    const text = doc('---', 'a: 1', '---', '# T');
    const s = scanMarkdown(text);
    expect(s.frontMatter).toEqual({ kind: 'yaml', raw: 'a: 1\n', start: 4, end: 9, bodyStart: 13, closeLine: 3 });
    expect(s.bodyStart).toBe(13);
    expect(scanMarkdown(doc('---', 'a: 1', '...', 'x')).frontMatter?.closeLine).toBe(3);
  });

  it('reads TOML between +++ lines, and closes each kind only with its own delimiter', () => {
    const s = scanMarkdown(doc('+++', 'a = 1', '---', '+++', 'body'));
    expect(s.frontMatter).toMatchObject({ kind: 'toml', raw: 'a = 1\n---\n', closeLine: 4 });
    expect(scanMarkdown(doc('---', 'a: 1', '+++', '---')).frontMatter).toMatchObject({ kind: 'yaml', closeLine: 4 });
  });

  it('allows spaces and tabs after a delimiter, and nothing else', () => {
    expect(scanMarkdown('--- \t\na: 1\n---  \nx').frontMatter?.raw).toBe('a: 1\n');
    for (const text of ['----\na\n----', ' ---\na\n---', '---x\na\n---', '---\na\n--- x', '...\na\n...', '+++ x\na\n+++']) {
      expect(scanMarkdown(text).frontMatter, text).toBeNull();
    }
  });

  it('is not front matter unless the first line opens it and a later line closes it', () => {
    expect(scanMarkdown(doc('', '---', 'a: 1', '---')).frontMatter).toBeNull();
    expect(scanMarkdown(doc('---', 'a: 1')).frontMatter).toBeNull();
    expect(scanMarkdown('---').frontMatter).toBeNull();
    expect(scanMarkdown('').frontMatter).toBeNull();
  });

  it('may be empty, and may end the document', () => {
    expect(scanMarkdown('---\n---\n').frontMatter).toEqual({ kind: 'yaml', raw: '', start: 4, end: 4, bodyStart: 8, closeLine: 2 });
    expect(scanMarkdown('---\na\n---').frontMatter?.bodyStart).toBe(9);
  });

  it('flags its lines, and is blank in every mask', () => {
    const text = doc('---', '# a: 1', '---', '# Body');
    const s = scanMarkdown(text);
    expect(s.lines.map((l) => l.frontMatter)).toEqual([true, true, true, false]);
    expect(s.lines[1]).toMatchObject({ content: '# a: 1', contentStart: 4, end: 10, code: false, html: false });
    expect(s.headings.map((h) => h.text)).toEqual(['Body']);
    for (const mask of [s.masks.structure, s.masks.prose, s.masks.directives]) {
      expect(mask).toBe(`${' '.repeat(3)}\n${' '.repeat(6)}\n${' '.repeat(3)}\n# Body`);
    }
    expect(s.isMasked(0)).toBe(true);
    expect(s.isMasked(s.bodyStart)).toBe(false);
  });

  it('counts offsets from a CRLF document as they are', () => {
    const s = scanMarkdown('---\r\na: 1\r\n---\r\nx');
    expect(s.frontMatter).toMatchObject({ raw: 'a: 1\r\n', start: 5, end: 11, bodyStart: 16 });
  });
});

describe('lines', () => {
  it('has one record per line, front matter included, and the record for line n at n - 1', () => {
    const s = scanMarkdown(doc('---', 'a: 1', '---', 'one', '', '  two  '));
    expect(s.lines.map((l) => l.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(s.lines[5]).toEqual({
      line: 6,
      start: 18,
      end: 25,
      contentStart: 18,
      content: '  two  ',
      indent: 2,
      blank: false,
      quoteDepth: 0,
      frontMatter: false,
      code: false,
      html: false,
      comment: false,
    });
    expect(s.lines[4]?.blank).toBe(true);
  });

  it('ends lines at LF, CRLF and CR, and opens no line after a final terminator', () => {
    const s = scanMarkdown('a\r\nb\rc\n');
    expect(s.lines.map((l) => [l.start, l.end, l.content])).toEqual([
      [0, 1, 'a'],
      [3, 4, 'b'],
      [5, 6, 'c'],
    ]);
    expect(scanMarkdown('').lines).toHaveLength(1);
  });

  it('takes block-quote markers off, and counts them', () => {
    const s = scanMarkdown(doc('> a', '> > b', '>', 'c'));
    expect(s.lines.map((l) => [l.quoteDepth, l.content, l.contentStart - l.start])).toEqual([
      [1, 'a', 2],
      [2, 'b', 4],
      [1, '', 1],
      [0, 'c', 0],
    ]);
    expect(s.lines[2]?.blank).toBe(true);
  });

  it('takes a byte-order mark off and says so', () => {
    const s = scanMarkdown('\uFEFF# Title');
    expect(s.text).toBe('# Title');
    expect(s.bom).toBe(1);
    expect(s.headings[0]?.start).toBe(0);
    expect(scanMarkdown('# Title').bom).toBe(0);
  });

  it('marks a line whose first character is in a comment, and no blank line', () => {
    const s = scanMarkdown(doc('<!-- a', '', 'b -->', 'c <!-- d -->', '   <!-- e --> f'));
    expect(s.lines.map((l) => l.comment)).toEqual([true, false, true, false, true]);
    expect(scanMarkdown(doc('abc', '   <!-- x -->')).lines.map((l) => l.comment)).toEqual([false, true]);
    expect(scanMarkdown(doc('<!-- x -->', '   text')).lines.map((l) => l.comment)).toEqual([true, false]);
  });
});

describe('fenced code', () => {
  it('runs from the opening fence to the closing one, both included', () => {
    const text = doc('a', '```ts', '# not', '```', 'b');
    const s = scanMarkdown(text);
    expect(codeLines(text)).toEqual([2, 3, 4]);
    expect(s.lines[2]).toMatchObject({ code: true, html: false, frontMatter: false });
    expect(s.blocks).toEqual([{ kind: 'fenced', start: 2, end: 17, line: 2, endLine: 4, info: 'ts', closed: true }]);
    expect(s.headings).toEqual([]);
  });

  it('runs to the end of the document when never closed', () => {
    const s = scanMarkdown(doc('~~~', 'a', '```'));
    expect(s.blocks).toMatchObject([{ kind: 'fenced', line: 1, endLine: 3, closed: false }]);
  });

  it('opens inside a list item, up to three columns past its text', () => {
    expect(codeLines(doc('- item', '', '   ```', '   # x', '   ```', '# after'))).toEqual([3, 4, 5]);
    expect(codeLines(doc('1. a', '   - b', '', '        ```', '        # x', '        ```', '# after'))).toEqual([4, 5, 6]);
  });

  it('is not opened four columns deep, where the line is code or text', () => {
    // A lone fence line in an item's indented code is code, and hides nothing.
    const listed = doc('- item', '', '      ```', '', '# after');
    expect(codeLines(listed)).toEqual([3]);
    expect(scanMarkdown(listed).headings.map((h) => h.text)).toEqual(['after']);
    // After a paragraph it is the paragraph's text.
    const continued = doc('para', '    ```', '', '# after');
    expect(codeLines(continued)).toEqual([]);
    expect(scanMarkdown(continued).headings.map((h) => h.text)).toEqual(['after']);
  });

  it('closes only on a fence of its character and at least its length', () => {
    expect(codeLines(doc('````', '```', '~~~~', '```` x', '````', 'after'))).toEqual([1, 2, 3, 4, 5]);
  });

  it('is not opened by a backtick fence with a backtick in its info string', () => {
    expect(codeLines(doc('```js`x', '# heading'))).toEqual([]);
    expect(scanMarkdown(doc('```js`x', '# heading')).headings.map((h) => h.text)).toEqual(['heading']);
  });

  it('ends with the block quote that holds it', () => {
    const text = doc('> ```', '> # in', '# out', '```');
    const s = scanMarkdown(text);
    expect(s.blocks[0]).toMatchObject({ line: 1, endLine: 2, closed: false });
    expect(s.headings.map((h) => h.text)).toEqual(['out']);
    expect(s.blocks[1]).toMatchObject({ line: 4, closed: false });
  });

  it('keeps a > inside a fence as code, not as a block quote', () => {
    const s = scanMarkdown(doc('```', '> ```', '```', '# out'));
    expect(s.lines[1]).toMatchObject({ code: true, quoteDepth: 0, content: '> ```' });
    expect(s.blocks).toMatchObject([{ line: 1, endLine: 3, closed: true }]);
    expect(s.headings.map((h) => h.line)).toEqual([4]);
  });

  it('takes off the markers of its own block quote only', () => {
    const s = scanMarkdown(doc('> ```', '> > x', '> ```'));
    expect(s.lines[1]).toMatchObject({ code: true, quoteDepth: 1, content: '> x' });
    expect(s.blocks[0]?.closed).toBe(true);
  });

  it('opens nothing inside a comment, and no comment opens inside it', () => {
    expect(codeLines(doc('<!--', '```', '-->', '# heading'))).toEqual([]);
    const s = scanMarkdown(doc('```', '<!--', '```', '# heading', '-->'));
    expect(s.comments).toEqual([]);
    expect(s.headings.map((h) => h.text)).toEqual(['heading']);
  });
});

describe('indented code', () => {
  it('needs four columns after a blank line, outside a list', () => {
    const text = doc('para', '', '    code', '\tmore', '', '    again', '', 'text');
    const s = scanMarkdown(text);
    expect(codeLines(text)).toEqual([3, 4, 5, 6]);
    expect(s.blocks).toEqual([{ kind: 'indented', start: 6, end: 31, line: 3, endLine: 6, info: '', closed: true }]);
  });

  it('never interrupts a paragraph, and opens at the top of the body', () => {
    expect(codeLines(doc('para', '    not code'))).toEqual([]);
    expect(codeLines(doc('    code'))).toEqual([1]);
    expect(codeLines(doc('---', 'a: 1', '---', '    code'))).toEqual([4]);
  });

  it('is read inside a list item four columns past its text, which is text before that', () => {
    expect(codeLines(doc('- item', '', '      code', '', '  text'))).toEqual([3]);
    expect(codeLines(doc('10. item', '', '        code'))).toEqual([3]);
    expect(codeLines(doc('10. item', '', '       text'))).toEqual([]);
    // Nested: the innermost item sets the margin, and a line left of it leaves it.
    expect(codeLines(doc('- a', '  - b', '', '        code'))).toEqual([4]);
    expect(codeLines(doc('- a', '  - b', '', '      text'))).toEqual([]);
    expect(codeLines(doc('- a', '  - b', '', '  back in a', '', '      code'))).toEqual([6]);
    // A marker with nothing after it puts the item's text one column past it.
    expect(codeLines(doc('-', '', '      code'))).toEqual([3]);
  });

  it('is not read inside a list, where four columns are a continuation', () => {
    expect(codeLines(doc('- item', '', '    continued'))).toEqual([]);
    expect(codeLines(doc('1. item', '', '    continued', '', 'para', '', '    code'))).toEqual([7]);
    // Neither a lazy line nor an indented one after a blank ends the list.
    expect(codeLines(doc('- item', 'lazy', '', '    continued'))).toEqual([]);
    expect(codeLines(doc('- item', '', '  more', '', '    continued'))).toEqual([]);
  });

  it('is read again once a list ends at an unindented line after a blank one, or at a heading', () => {
    expect(codeLines(doc('- item', '', 'para', '', '    code'))).toEqual([5]);
    expect(codeLines(doc('- item', '  # heading', '', '    code'))).toEqual([4]);
  });

  it('holds a fence as text rather than opening one', () => {
    const text = doc('', '    ```', '    # x', '', '# heading', '```');
    expect(codeLines(text)).toEqual([2, 3, 6]);
    expect(scanMarkdown(text).headings.map((h) => h.text)).toEqual(['heading']);
  });

  it('leaves the blank lines after it out', () => {
    const s = scanMarkdown(doc('    code', '', '', 'text'));
    expect(s.lines.map((l) => l.code)).toEqual([true, false, false, false]);
    expect(scanMarkdown(doc('    code', '', '')).lines.map((l) => l.code)).toEqual([true, false]);
  });
});

describe('raw-text HTML', () => {
  it('runs from the open tag to the line with a close tag', () => {
    const text = doc('<pre>', '# not', '[x](y)', '</pre>', '# yes');
    const s = scanMarkdown(text);
    expect(where(text, (l) => l.html)).toEqual([1, 2, 3, 4]);
    expect(s.lines[1]).toMatchObject({ html: true, code: false, frontMatter: false });
    expect(s.blocks).toEqual([{ kind: 'html', start: 0, end: 25, line: 1, endLine: 4, info: '', closed: true }]);
    expect(s.headings.map((h) => h.text)).toEqual(['yes']);
    expect(s.links).toEqual([]);
  });

  it('closes on its own line, and runs to the end when never closed', () => {
    expect(scanMarkdown(doc('<script>x()</script>', '# yes')).blocks).toMatchObject([{ line: 1, endLine: 1, closed: true }]);
    expect(scanMarkdown(doc('<style>', 'a')).blocks).toMatchObject([{ line: 1, endLine: 2, closed: false }]);
  });

  it('holds a fence as text', () => {
    const s = scanMarkdown(doc('<pre>', '```', '</pre>', '# out'));
    expect(s.blocks).toHaveLength(1);
    expect(s.headings.map((h) => h.text)).toEqual(['out']);
  });

  it('does not hide the Markdown inside a <div> or <details>', () => {
    const s = scanMarkdown(doc('<details>', '', '# inside', '', '</details>'));
    expect(s.blocks).toEqual([]);
    expect(s.headings.map((h) => h.text)).toEqual(['inside']);
  });

  it('ends with the block quote that holds it', () => {
    const s = scanMarkdown(doc('> <pre>', '> x', '# out'));
    expect(s.blocks).toMatchObject([{ line: 1, endLine: 2, closed: false }]);
    expect(s.headings.map((h) => h.text)).toEqual(['out']);
  });
});

describe('code spans', () => {
  it('pairs runs of the same length', () => {
    expect(spans('a `b` c ``d`e`` f')).toEqual(['`b`', '``d`e``']);
    expect(spans('```a``b```')).toEqual(['```a``b```']);
  });

  it('leaves a run without a partner as text, and still pairs the runs after it', () => {
    expect(spans('a ` b ``c`` d')).toEqual(['``c``']);
    expect(spans('`a ``b`` c')).toEqual(['``b``']);
    expect(spans('``a`')).toEqual([]);
  });

  it('opens nothing on an escaped backtick', () => {
    expect(spans('\\`a` b`')).toEqual(['` b`']);
    expect(spans('\\\\`a`')).toEqual(['`a`']);
    // The escape leaves a run of one where the search for a closer saw two.
    expect(spans('x ` a \\`` b')).toEqual([]);
  });

  it('crosses a line inside a paragraph', () => {
    expect(spans('a `b\nc` d')).toEqual(['`b\nc`']);
    expect(spans('> a `b\n> c` d')).toEqual(['`b\n> c`']);
    expect(spans('- a `b\n  c` d')).toEqual(['`b\n  c`']);
    expect(spans('---\na: 1\n---\nx `y\nz` w')).toEqual(['`y\nz`']);
  });

  it('never crosses the end of a paragraph', () => {
    const ends = ['', '# h', '- item', '1. item', '> quote', '---', '***', '===', '```', '<pre>', '<!-- c -->'];
    for (const line of ends) expect(spans(`a \`b\n${line}\nc\` d`), JSON.stringify(line)).toEqual([]);
    expect(spans('# a `b\nc` d')).toEqual([]);
    expect(spans('a `b\n\n`c` d')).toEqual(['`c`']);
  });

  it('lets a later paragraph pair runs an earlier one could not', () => {
    expect(spans('a `` b\n\nc `` d `` e')).toEqual(['`` d ``']);
    expect(spans('a ` b ``` c `` d')).toEqual([]);
    expect(spans('a ` b ``` c ```')).toEqual(['``` c ```']);
  });

  it('keeps <!-- inside a span as code', () => {
    const s = scanMarkdown('Use `<!--` to open.\n## Visible');
    expect(s.comments).toEqual([]);
    expect(s.codeSpans).toHaveLength(1);
    expect(s.headings.map((h) => h.text)).toEqual(['Visible']);
  });
});

describe('comments', () => {
  it('runs from <!-- to the next -->, across lines and blank lines', () => {
    const s = scanMarkdown(doc('a <!-- b', '', '# c -->', 'd'));
    expect(s.comments).toEqual([{ start: 2, end: 17, inner: ' b\n\n# c ', innerStart: 6, line: 1, closed: true }]);
    expect(s.headings).toEqual([]);
  });

  it('reads <!--> and <!---> as whole, empty comments', () => {
    expect(scanMarkdown('a <!--> b -->').comments).toMatchObject([{ start: 2, end: 7, inner: '', closed: true }]);
    expect(scanMarkdown('a <!---> b -->').comments).toMatchObject([{ start: 2, end: 8, inner: '' }]);
    expect(scanMarkdown('a <!----> b').comments).toMatchObject([{ start: 2, end: 9, inner: '' }]);
    expect(comments('<!-- x --->')).toEqual([' x -']);
  });

  it('reads a <!-- in the middle of a line with no --> after it as text', () => {
    const s = scanMarkdown(doc('a <!-- b', '# c'));
    expect(s.comments).toEqual([]);
    expect(s.headings.map((h) => h.text)).toEqual(['c']);
  });

  it('runs a <!-- opening a line with no --> after it to the end of the document', () => {
    const s = scanMarkdown(doc('a', '   <!-- b', '# c'));
    expect(s.comments).toEqual([{ start: 5, end: 15, inner: ' b\n# c', innerStart: 9, line: 2, closed: false }]);
    expect(s.headings).toEqual([]);
    expect(scanMarkdown(doc('> <!-- b', '# c')).comments).toMatchObject([{ closed: false }]);
  });

  it('does not run one opened after four spaces, or after text, to the end', () => {
    expect(scanMarkdown(doc('- a', '    <!-- b', '# c')).comments).toEqual([]);
    expect(scanMarkdown(doc('x <!-- a', '<!-- b', '# c')).comments).toMatchObject([{ start: 9, closed: false }]);
  });

  it('reads every later <!-- in the middle of a line as text once one has no -->', () => {
    expect(comments(doc('a <!-- b', 'c <!-- d', 'e'))).toEqual([]);
    // `<!-->` holds a `-->`, which closes a comment opened before it.
    expect(scanMarkdown(doc('a <!-- b', '<!-->')).comments).toMatchObject([{ start: 2, end: 14 }]);
  });

  it('opens nothing on an escaped <', () => {
    expect(scanMarkdown('\\<!-- a -->').comments).toEqual([]);
  });

  it('keeps backticks inside it as text', () => {
    const s = scanMarkdown(doc('<!-- `a -->', 'b` c'));
    expect(s.comments).toHaveLength(1);
    expect(s.codeSpans).toEqual([]);
  });

  it('holds a span opened after it on the same line', () => {
    expect(spans('<!-- a --> `b` <!-- c -->')).toEqual(['`b`']);
    expect(comments('`<!--` <!-- x -->')).toEqual([' x ']);
  });
});

describe('masks', () => {
  const text = doc('---', 'k: v', '---', 'a `b` <!-- c -->', '```', 'd', '```', '<!-- @x -->');

  it('blanks what each is for, keeping every terminator where it was', () => {
    const s = scanMarkdown(text);
    const lines = (mask: string): string[] => mask.split('\n');
    const front = ['   ', '    ', '   '];
    expect(lines(s.masks.structure)).toEqual([...front, `a${' '.repeat(15)}`, '   ', ' ', '   ', ' '.repeat(11)]);
    expect(lines(s.masks.prose)).toEqual([...front, `a \`b\`${' '.repeat(11)}`, '```', 'd', '```', ' '.repeat(11)]);
    expect(lines(s.masks.directives)).toEqual([...front, `a${' '.repeat(5)}<!-- c -->`, '   ', ' ', '   ', '<!-- @x -->']);
  });

  it('answers whether an offset is masked, in each mask', () => {
    const s = scanMarkdown(text);
    const span = s.text.indexOf('`b`');
    const comment = s.text.indexOf('<!-- c');
    const fence = s.text.indexOf('```');
    expect([s.isMasked(span), s.isMasked(span, 'prose'), s.isMasked(span, 'directives')]).toEqual([true, false, true]);
    expect([s.isMasked(comment), s.isMasked(comment, 'prose'), s.isMasked(comment, 'directives')]).toEqual([true, true, false]);
    expect([s.isMasked(fence), s.isMasked(fence, 'prose'), s.isMasked(fence, 'directives')]).toEqual([true, false, true]);
    expect(s.isMasked(s.text.indexOf('a `'))).toBe(false);
  });

  it('gives the lines of any view, each as long as the text line', () => {
    const s = scanMarkdown('a `b`\r\nc\n');
    expect(linesOf(s)).toEqual(['a `b`', 'c', '']);
    expect(linesOf(s, 'structure')).toEqual(['a    ', 'c', '']);
    expect(linesOf(s, 'prose')).toEqual(['a `b`', 'c', '']);
    expect(linesOf(s, 'directives')).toEqual(['a    ', 'c', '']);
  });
});
