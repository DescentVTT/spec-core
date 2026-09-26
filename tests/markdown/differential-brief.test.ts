/**
 * spec-core's scanner and front matter reader against spec-brief's, which
 * they replace.
 *
 * spec-brief works in 0-based lines; each shape below converts spec-core's
 * offsets and 1-based lines to that, so the two can be compared whole.
 */

import { describe, expect, it } from 'vitest';

import {
  linesOf,
  readFrontMatter,
  removeEntry,
  scanMarkdown,
  sectionsOf,
  setEntry,
  titleOf,
  type FrontMatter,
  type MarkdownScan,
} from '../../src/markdown/index.js';
import { generate, pick, random, type Profile, type Rand } from './corpus.js';
import * as brief from './reference/spec-brief/frontmatter.js';
import { linksOf, scan as briefScan, sectionsOf as briefSections, titleOf as briefTitle, type Scan } from './reference/spec-brief/markdown.js';

const doc = (...lines: string[]): string => lines.join('\n');

/** What spec-brief reads correctly: no setext headings, indented code, raw-text HTML. */
const PLAIN: Profile = {
  wild: false,
  setext: false,
  indented: false,
  quotes: true,
  blockComments: true,
  hiddenHeadings: true,
  tables: true,
  references: true,
  html: false,
  frontMatter: true,
  titles: true,
};

function oldScan(text: string): Scan {
  const lines = text.split('\n');
  const fm = brief.readFrontMatter(lines);
  return briefScan(lines, fm === null || fm.close < 0 ? 0 : fm.close + 1);
}

function oldShape(s: Scan, lineCount: number) {
  return {
    prose: s.prose,
    masked: s.masked,
    headings: s.headings,
    tasks: s.tasks,
    // spec-brief counted the empty line after a final terminator as a line; the line table does not.
    sections: briefSections(s).map((x) => [x.heading.line, Math.min(x.end, lineCount)]),
    title: briefTitle(s) ?? null,
    links: linksOf(s).sort((a, b) => a.line - b.line || a.start - b.start),
  };
}

function newShape(s: MarkdownScan) {
  const heading = (h: MarkdownScan['headings'][number]) => ({ line: h.line - 1, level: h.level, text: h.text });
  const title = titleOf(s);
  return {
    prose: linesOf(s, 'prose'),
    masked: linesOf(s, 'structure'),
    headings: s.headings.map(heading),
    // spec-brief reads the three GFM checkboxes as tasks.
    tasks: s.listItems
      .filter((i) => i.checkbox !== null && ' xX'.includes(i.checkbox))
      .map((i) => ({ line: i.line - 1, end: i.endLine, checked: i.checkbox !== ' ', text: i.firstLine })),
    sections: sectionsOf(s, 2).map((x) => [x.heading.line - 1, x.endLine - 1]),
    title: title === undefined ? null : heading(title),
    // spec-brief reads the destinations written in a link or a definition, images included.
    links: s.links
      .filter((l) => l.form === 'inline' || l.form === 'definition')
      .map((l) => {
        const start = s.index.lineStart(l.line);
        return { line: l.line - 1, start: l.targetStart - start, end: l.targetEnd - start, target: l.target };
      }),
  };
}

describe('agreement with spec-brief', () => {
  it('on generated documents it reads correctly', () => {
    const rand = random(2);
    for (let n = 0; n < 250; n += 1) {
      const text = generate(rand, PLAIN, 3 + Math.floor(rand() * 10));
      const s = scanMarkdown(text);
      expect(newShape(s), text).toEqual(oldShape(oldScan(text), s.index.lineCount));
    }
  });

  it('on a brief', () => {
    const text = doc(
      '---',
      'status: active',
      '---',
      '# 012 - Title',
      '',
      '## Goals <!-- required -->',
      '',
      '<!-- say what this achieves -->',
      '',
      '## Tasks',
      '',
      '- [ ] one `code`',
      '  continued',
      '- [x] two, see [the ADR](../docs/adr/0001.md) and ![diagram](img/d.png)',
      '',
      '```md',
      '- [ ] not a task',
      '```',
      '',
      '[ref]: <docs/a b.md> "Title"',
    );
    const scanned = scanMarkdown(text);
    const s = newShape(scanned);
    const old = oldShape(oldScan(text), scanned.index.lineCount);
    // spec-brief kept the comment in the heading's text; see the difference below.
    expect({ ...s, headings: s.headings.filter((h) => h.line !== 5), sections: s.sections, title: s.title }).toEqual({
      ...old,
      headings: old.headings.filter((h) => h.line !== 5),
    });
  });
});

describe('where spec-brief differs, on purpose', () => {
  it('a comment after a heading is not part of its text', () => {
    expect(oldScan('## Goals <!-- required -->').headings[0]?.text).toBe('Goals <!-- required -->');
    expect(scanMarkdown('## Goals <!-- required -->').headings[0]?.text).toBe('Goals');
  });

  it('setext headings and headings in a block quote are headings, marked by their form', () => {
    const text = doc('Title', '=====', '', '> ## Quoted');
    expect(oldScan(text).headings).toEqual([]);
    expect(scanMarkdown(text).headings.map((h) => [h.form, h.text])).toEqual([
      ['setext', 'Title'],
      ['atx', 'Quoted'],
    ]);
  });

  it('indented code and raw-text HTML are code', () => {
    const text = doc('para', '', '    - [ ] in indented code', '', '<pre>', '## in pre', '</pre>');
    expect(oldScan(text).tasks).toHaveLength(1);
    expect(oldScan(text).headings).toHaveLength(1);
    const s = scanMarkdown(text);
    expect(s.listItems).toEqual([]);
    expect(s.headings).toEqual([]);
  });

  it('a code span may cross a line of its paragraph', () => {
    const text = doc('a `b', 'c` d');
    expect(oldScan(text).masked).toEqual(['a `b', 'c` d']);
    expect(linesOf(scanMarkdown(text), 'structure')).toEqual(['a   ', '   d']);
  });

  it('a <!-- in the middle of a line with no --> after it is text, not a comment to the end', () => {
    const text = doc('a <!-- b', '## c');
    expect(oldScan(text).headings).toEqual([]);
    expect(scanMarkdown(text).headings.map((h) => h.text)).toEqual(['c']);
  });

  it('a thematic break ends a task instead of continuing it', () => {
    const text = doc('- [ ] a', '***');
    expect(oldScan(text).tasks[0]?.end).toBe(2);
    expect(scanMarkdown(text).listItems[0]?.endLine).toBe(1);
  });

  it('only a link or a definition has a destination', () => {
    for (const text of ['a](b)', '[a](b c)', '[a](b "t" x)']) {
      expect(linksOf(oldScan(text)).length, text).toBeGreaterThan(0);
      expect(scanMarkdown(text).links, text).toEqual([]);
    }
  });

  it('a tab indents to the next multiple of four columns', () => {
    // spec-brief counted characters: a tab-indented line was not deeper than two spaces.
    const text = doc('  - [ ] a', '', '\tnested');
    expect(oldScan(text).tasks[0]?.end).toBe(1);
    expect(scanMarkdown(text).listItems[0]?.endLine).toBe(3);
  });
});

/* ----------------------------------------------------------- front matter */

function frontMatterLine(rand: Rand): string[] {
  const key = pick(rand, ['status', 'Status', 'depends-on', 'depends_on', 'wave', 'id', 'x.y', 'title']);
  return pick(rand, [
    [`${key}: ${pick(rand, ['active', '035', 'yes', 'two words', 'a#b', 'http://x', '~', 'null', 'x # c'])}`],
    [`${key}: ${pick(rand, ['"quoted \\"x\\""', "'it''s'", '"\\x41\\u00e9"', '"\\q"', '"open', "'open", '"a" b'])}`],
    [`${key}: ${pick(rand, ['[a, "b, c", \'d\']', '[]', '[ a , b, ]', '[a, b', '[a] b', '[[a]]', '[a, , b]', '[a: b]'])}`],
    [`${key}:`, '  - a', '  - "b"'],
    [`${key}:`, '- a', '- b # c'],
    [`${key}:`, '  - a', '    - b'],
    [`${key}:`, '  -'],
    [`${key}:`, '  sub: 1'],
    [`${key}:`, '  folded text'],
    [`${key}: first`, '  second'],
    [`${key}:`],
    [`${key}: # only a comment`],
    [`${key}: {a: 1}`, `${key}: |`, `${key}: &a x`, `${key}: @x`, `${key}: a: b`, `${key}: - a`],
    ['# a comment'],
    [''],
    ['just text'],
    ['  indented'],
  ]);
}

function frontMatterText(rand: Rand): string {
  const lines = ['---'];
  const count = Math.floor(rand() * 8);
  for (let i = 0; i < count; i += 1) lines.push(...frontMatterLine(rand));
  if (rand() < 0.9) lines.push(pick(rand, ['---', '...', '--- ']));
  lines.push('', '# Body');
  return lines.join('\n');
}

const briefShape = (fm: FrontMatter | brief.FrontMatter | null) =>
  fm === null
    ? null
    : {
        close: fm.close,
        entries: fm.entries.map((e) => ({ key: e.key, name: e.name, line: e.line, end: e.end, value: e.value })),
        problems: fm.problems,
      };

describe('the front matter reader against spec-brief', () => {
  it('reads the same entries, values and problems from generated front matter', () => {
    const rand = random(3);
    for (let n = 0; n < 400; n += 1) {
      const text = frontMatterText(rand);
      expect(briefShape(readFrontMatter(text)), text).toEqual(briefShape(brief.readFrontMatter(text.split('\n'))));
    }
  });

  it('makes the same edits', () => {
    const rand = random(4);
    for (let n = 0; n < 200; n += 1) {
      const text = frontMatterText(rand);
      const lines = text.split('\n');
      const mine = readFrontMatter(text);
      const theirs = brief.readFrontMatter(lines);
      if (mine === null || mine.close < 0) continue;
      const key = pick(rand, ['status', 'wave', 'integrity', 'dependsOn']);
      expect(setEntry(lines, mine, key, 'v'), text).toEqual(brief.setEntry(lines, theirs, key, 'v'));
      expect(removeEntry(lines, mine, key), text).toEqual(brief.removeEntry(lines, theirs, key));
    }
  });

  it('differs on purpose only for TOML, which spec-brief did not recognise', () => {
    expect(brief.readFrontMatter(['+++', 'a = 1', '+++'])).toBeNull();
    expect(readFrontMatter('+++\na = 1\n+++')?.kind).toBe('toml');
  });
});
