/**
 * spec-core's scanner against spec-graph's, which it replaces.
 *
 * On documents made only of what spec-graph reads correctly the two must
 * agree field for field. Where spec-graph was wrong, each difference is
 * written out below with the reason, so a spec-graph user reading its
 * changelog can see what changes and why.
 */

import { describe, expect, it } from 'vitest';

import { readFrontMatter, scanMarkdown, slugify, type MarkdownScan, type YamlValue } from '../../src/markdown/index.js';
import { generate, pick, random, type Profile, type Rand } from './corpus.js';
import { scanMarkdown as graphScan, slugify as graphSlugify, type ScannedDocument } from './reference/spec-graph/markdown.js';
import { parseFrontMatter } from './reference/spec-graph/yaml.js';

const doc = (...lines: string[]): string => lines.join('\n');

/** What spec-graph reads correctly: no raw-text HTML, no indented code, no structure inside comments. */
const PLAIN: Profile = {
  wild: false,
  setext: true,
  indented: false,
  quotes: true,
  blockComments: true,
  hiddenHeadings: false,
  tables: true,
  references: true,
  html: false,
  frontMatter: true,
  titles: true,
};

function oldShape(s: ScannedDocument) {
  return {
    frontMatter: s.frontMatter,
    bodyStart: s.bodyStart,
    lines: s.lines.map((l) => [l.line, l.start, l.end, l.contentStart, l.content, l.indent, l.blank, l.quoteDepth, l.code]),
    headings: s.headings.map((h) => [h.level, h.text, h.slug, h.start, h.end, h.line]),
    comments: s.comments,
    listItems: s.listItems.map((i) => [
      i.start,
      i.end,
      i.markerStart,
      i.marker,
      i.textStart,
      i.checkbox,
      i.checkboxStart,
      i.firstLine,
      i.body,
      i.maskedBody,
      i.line,
      i.depth,
      i.indent,
    ]),
    links: s.links.map((l) => [l.form, l.text, l.target, l.start, l.end, l.targetStart, l.label, l.line]),
    tables: s.tables,
    masked: s.masked,
  };
}

function newShape(s: MarkdownScan) {
  return {
    frontMatter: s.frontMatter === null ? null : { raw: s.frontMatter.raw, start: s.frontMatter.start, end: s.frontMatter.end, bodyStart: s.frontMatter.bodyStart },
    bodyStart: s.bodyStart,
    lines: s.lines.filter((l) => !l.frontMatter).map((l) => [l.line, l.start, l.end, l.contentStart, l.content, l.indent, l.blank, l.quoteDepth, l.code]),
    headings: s.headings.map((h) => [h.level, h.text, h.slug, h.start, h.end, h.line]),
    comments: s.comments.map((c) => ({ start: c.start, end: c.end, inner: c.inner, innerStart: c.innerStart, line: c.line })),
    listItems: s.listItems.map((i) => [
      i.start,
      i.end,
      i.markerStart,
      i.marker,
      i.textStart,
      i.checkbox,
      i.checkboxStart,
      i.firstLine,
      i.body,
      i.maskedBody,
      i.line,
      i.depth,
      i.indent,
    ]),
    // spec-graph reports no images; it will filter them out.
    links: s.links.filter((l) => !l.image).map((l) => [l.form, l.text, l.target, l.start, l.end, l.targetStart, l.label, l.line]),
    tables: s.tables.map((t) => ({ start: t.start, end: t.end, headers: t.headers, rows: t.rows })),
    masked: s.masks.structure,
  };
}

describe('agreement with spec-graph', () => {
  it('on generated documents it reads correctly, field for field', () => {
    const rand = random(1);
    for (let n = 0; n < 250; n += 1) {
      const text = generate(rand, PLAIN, 3 + Math.floor(rand() * 10));
      expect(newShape(scanMarkdown(text)), text).toEqual(oldShape(graphScan(text)));
    }
  });

  it('on hand-written documents it reads correctly', () => {
    const cases = [
      doc('---', 'status: accepted', '---', '# ADR-0007: Title', '', '## Status', '', 'Accepted', '', '## Decision', '', '- [x] Do it', '  - [ ] nested', '- [~] later'),
      doc('Intro with `code` and <!-- a hint --> and [a link](docs/a.md#x).', '', '| Id | Spec |', '|----|------|', '| 1 | [one](one.md) |'),
      doc('```ts', 'const x = "[not](a-link)";', '```', '', '[def]: target.md', '', 'Uses [def] and [text][def].'),
      doc('Setext', '======', '', 'Two', '---', '', '> quoted `code`', '> more'),
    ];
    for (const text of cases) expect(newShape(scanMarkdown(text)), text).toEqual(oldShape(graphScan(text)));
  });
});

describe('where spec-graph was wrong, and spec-core differs on purpose', () => {
  it('a heading ends where CommonMark ends it: a trailing comment is not text, and a # needs a space to close it', () => {
    expect(graphScan('## Title <!-- note -->').headings[0]?.text).toBe('Title <!-- note -->');
    expect(scanMarkdown('## Title <!-- note -->').headings[0]?.text).toBe('Title');
    expect(graphScan('# About C#').headings[0]?.text).toBe('About C');
    expect(scanMarkdown('# About C#').headings[0]?.text).toBe('About C#');
  });

  it('the content of <pre> and <script> is not Markdown, headings included', () => {
    const text = doc('<pre>', '# not a heading', '</pre>');
    expect(graphScan(text).headings).toHaveLength(1);
    expect(scanMarkdown(text).headings).toEqual([]);
  });

  it('a setext underline is not reused, and does not underline a table or cross a block quote', () => {
    const reused = doc('Title', '===', '---');
    expect(graphScan(reused).headings.map((h) => h.text)).toEqual(['Title', '===']);
    expect(scanMarkdown(reused).headings.map((h) => h.text)).toEqual(['Title']);
    const quoted = doc('> quoted', '---');
    expect(graphScan(quoted).headings.map((h) => h.text)).toEqual(['quoted']);
    expect(scanMarkdown(quoted).headings).toEqual([]);
  });

  it('a thematic break is not a list item', () => {
    expect(graphScan('* * *').listItems).toHaveLength(1);
    expect(scanMarkdown('* * *').listItems).toEqual([]);
  });

  it('an item ends where CommonMark ends it: at a fence or a block quote no deeper than its marker', () => {
    const fence = doc('- item', '```', 'code', '```');
    expect(graphScan(fence).listItems[0]?.end).toBe(fence.length);
    expect(scanMarkdown(fence).listItems[0]?.endLine).toBe(1);
    const quote = doc('- item', '> quote');
    expect(graphScan(quote).listItems[0]?.end).toBe(quote.length);
    expect(scanMarkdown(quote).listItems[0]?.endLine).toBe(1);
  });

  it('a heading closes every list, so the next item is at depth 0', () => {
    const text = doc('- a', '# H', '  - b');
    expect(graphScan(text).listItems.map((i) => i.depth)).toEqual([0, 1]);
    expect(scanMarkdown(text).listItems.map((i) => i.depth)).toEqual([0, 0]);
  });

  it('images are reported, marked as images, for the tools that rewrite their paths', () => {
    expect(graphScan('![a](b.png)').links).toEqual([]);
    expect(scanMarkdown('![a](b.png)').links).toMatchObject([{ form: 'inline', image: true, target: 'b.png' }]);
  });

  it('an angle-bracket destination is reported inside its brackets, so replacing it keeps them', () => {
    expect(graphScan('[a](<b c.md>)').links[0]?.targetStart).toBe(4);
    expect(scanMarkdown('[a](<b c.md>)').links[0]).toMatchObject({ targetStart: 5, targetEnd: 11 });
  });

  it('what is not a link or a definition in CommonMark is not reported as one', () => {
    for (const text of ['[a](b c)', '[Note]: this matters', '[^1]: a footnote', doc('[^1]: a footnote', '', 'see [^1]')]) {
      expect(graphScan(text).links.length, text).toBeGreaterThan(0);
      expect(scanMarkdown(text).links, text).toEqual([]);
    }
  });

  it('an autolink written as a destination is part of that link, not a second one', () => {
    expect(graphScan('[a](<https://x.org>)').links.map((l) => l.form)).toEqual(['inline', 'autolink']);
    expect(scanMarkdown('[a](<https://x.org>)').links.map((l) => l.form)).toEqual(['inline']);
  });

  it('a link inside brackets that are not one is found, and a bracket before a bad destination is a shortcut', () => {
    expect(graphScan('[a [b](c) d]').links).toEqual([]);
    expect(scanMarkdown('[a [b](c) d]').links.map((l) => l.target)).toEqual(['c']);
    const shortcut = doc('[foo](not a link)', '', '[foo]: /url');
    // spec-graph skipped to the first `)` and read `not` as the destination.
    expect(graphScan(shortcut).links.map((l) => [l.form, l.target])).toEqual([
      ['inline', 'not'],
      ['definition', '/url'],
    ]);
    expect(scanMarkdown(shortcut).links.map((l) => l.form)).toEqual(['shortcut', 'definition']);
  });

  it('a table needs a delimiter row with as many cells as its header, and an indented border pipe is a border', () => {
    expect(graphScan(doc('| a | b |', '|---|---|---|')).tables).toHaveLength(1);
    expect(scanMarkdown(doc('| a | b |', '|---|---|---|')).tables).toEqual([]);
    const indented = doc('  | a |', '  |---|');
    expect(graphScan(indented).tables[0]?.headers.map((c) => c.text)).toEqual(['', 'a']);
    expect(scanMarkdown(indented).tables[0]?.headers.map((c) => c.text)).toEqual(['a']);
  });

  it('a fence ends with its block quote, and a > inside a fence is code', () => {
    const quoted = doc('> ```', '> code', '# after');
    expect(graphScan(quoted).headings).toEqual([]);
    expect(scanMarkdown(quoted).headings.map((h) => h.text)).toEqual(['after']);
    const inside = doc('```', '> ```', '# still code', '```');
    expect(graphScan(inside).headings.map((h) => h.text)).toEqual(['still code']);
    expect(scanMarkdown(inside).headings).toEqual([]);
  });

  it('front matter opens on exactly ---, and a comment opening a line runs to the end when never closed', () => {
    expect(graphScan('----\na: 1\n----').frontMatter).not.toBeNull();
    expect(scanMarkdown('----\na: 1\n----').frontMatter).toBeNull();
    const unclosed = doc('<!-- draft', '# hidden');
    expect(graphScan(unclosed).headings).toHaveLength(1);
    expect(scanMarkdown(unclosed).headings).toEqual([]);
  });

  it('a code span ends with its paragraph', () => {
    const text = doc('a `b', '', 'See [the spec](spec.md).', '', 'c` d');
    expect(graphScan(text).links).toEqual([]);
    expect(scanMarkdown(text).links.map((l) => l.target)).toEqual(['spec.md']);
  });

  it('an indented fence outside a list is indented code, and blank lines after indented code are not code', () => {
    const text = doc('', '    ```', '    x', '', '# after', '```');
    expect(graphScan(text).headings).toEqual([]);
    expect(scanMarkdown(text).headings.map((h) => h.text)).toEqual(['after']);
    const trailing = doc('    code', '', 'text');
    expect(graphScan(trailing).lines.map((l) => l.code)).toEqual([true, true, false]);
    expect(scanMarkdown(trailing).lines.map((l) => l.code)).toEqual([true, false, false]);
  });
});

/* ----------------------------------------------------------- front matter */

function yamlLines(rand: Rand): string[] {
  const key = pick(rand, ['status', 'Status', 'depends-on', 'supersedes', 'id', 'tags']);
  const word = (): string => pick(rand, ['accepted', 'ADR-0007', 'two words', 'docs/a.md', '2026-09-26']);
  return pick(rand, [
    [`${key}: ${word()}`],
    [`${key}: ${word()} # a comment`],
    [`${key}: "${word()}"`],
    [`${key}: '${word()}'`],
    [`${key}: [${word()}, ${word()}]`],
    [`${key}: []`],
    [`${key}:`, `  - ${word()}`, `  - "${word()}"`],
    [`${key}:`],
    [`${key}:`, `  child: ${word()}`, `  other-child: [${word()}]`, '  list:', `    - ${word()}`],
    ['# a comment'],
    [''],
  ]);
}

const graphValue = (value: string | readonly string[]): string | string[] => (typeof value === 'string' ? value : [...value]);
const newValue = (value: YamlValue): string | string[] | null =>
  value.kind === 'scalar' ? value.scalar.text : value.kind === 'list' ? value.items.map((i) => i.text) : null;

describe('the front matter reader against spec-graph, reading one level of nesting', () => {
  it('reads the same keys, values and value offsets', () => {
    const rand = random(6);
    for (let n = 0; n < 300; n += 1) {
      const lines = ['---'];
      const count = 1 + Math.floor(rand() * 6);
      for (let i = 0; i < count; i += 1) lines.push(...yamlLines(rand));
      lines.push('---', '# Body');
      const text = lines.join('\n');
      const block = scanMarkdown(text).frontMatter;
      if (block === null) throw new Error('expected front matter');
      const theirs = parseFrontMatter(block.raw, block.start).map((e) => [e.key, graphValue(e.value), e.start, e.valueStart]);
      const mine = readFrontMatter(text, { nested: true })!.entries.map((e) => [e.key.toLowerCase(), newValue(e.value), e.keyStart, e.valueStart]);
      expect(mine, text).toEqual(theirs);
    }
  });

  it('differs on purpose where spec-graph read what YAML does not say', () => {
    // A value continued on the next line was read as its first line; it is unsupported.
    const text = doc('---', 'title: first', '  second', '---');
    const block = scanMarkdown(text).frontMatter!;
    expect(parseFrontMatter(block.raw, block.start)[0]?.value).toBe('first');
    expect(readFrontMatter(text, { nested: true })?.entries[0]?.value.kind).toBe('unsupported');
  });
});

describe('the slug against spec-graph', () => {
  it('slugs every text as spec-graph did', () => {
    const rand = random(8);
    const pool = [...'aZ09 _-`*~[]()<>#!|.,:;?/\'"&%$@^+=\t', 'é', 'ß', 'Ü', '中', String.fromCharCode(0x301), String.fromCharCode(0xa0), '😀'];
    for (let n = 0; n < 2000; n += 1) {
      let text = '';
      const length = Math.floor(rand() * 12);
      for (let i = 0; i < length; i += 1) text += pick(rand, pool);
      expect(slugify(text), JSON.stringify(text)).toBe(graphSlugify(text));
    }
  });
});
