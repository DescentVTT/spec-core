/**
 * spec-core's directives mask and title against spec-guard's `maskCode` and
 * `parseTitle`, which they replace.
 *
 * spec-guard masked code and kept comments, because its directives are
 * comments; the directives mask is the same view. It did not know front
 * matter, indented code or raw-text HTML, so the documents compared here
 * have none.
 */

import { describe, expect, it } from 'vitest';

import { scanMarkdown, titleOf } from '../../src/markdown/index.js';
import { generate, random, type Profile } from './corpus.js';
import { maskCode, parseDirectives, parseTitle } from './reference/spec-guard/parser.js';

const doc = (...lines: string[]): string => lines.join('\n');
const context = { file: '/r/spec.md', relativeFile: 'spec.md' };
const directive = '<!-- @assert-absence target="src/" symbol="X" -->';

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
  frontMatter: false,
  titles: true,
};

describe('agreement with spec-guard', () => {
  it('masks the same code and keeps the same comments on generated documents', () => {
    const rand = random(5);
    for (let n = 0; n < 250; n += 1) {
      const text = generate(rand, PLAIN, 3 + Math.floor(rand() * 10));
      const s = scanMarkdown(text);
      expect(s.masks.directives, text).toBe(maskCode(text));
      expect(titleOf(s)?.text, text).toBe(parseTitle(text));
    }
  });

  it('finds the same directives', () => {
    const text = doc('# Decision', '', directive, '', 'Shown as `<!-- @assert-absence target="x" -->` in prose.', '', '```md', directive, '```');
    const mine = scanMarkdown(text).comments.filter((c) => c.inner.trimStart().startsWith('@'));
    const theirs = parseDirectives(text, context).directives;
    expect(mine.map((c) => [c.line, text.slice(c.start, c.end)])).toEqual(theirs.map((d) => [d.location.line, d.raw]));
  });
});

describe('where spec-guard differs, on purpose', () => {
  it('a backtick inside a comment is text, so a directive holding one keeps it', () => {
    const text = doc('<!-- @assert-absence target="src/" symbol="`eval`" -->', 'text');
    expect(maskCode(text).includes('`eval`')).toBe(false);
    expect(scanMarkdown(text).masks.directives.includes('`eval`')).toBe(true);
  });

  it('a code span ends with its paragraph, so a stray backtick cannot hide the directives after it', () => {
    const text = doc('Press ` to open the console.', '', directive, '', 'Or `.');
    expect(maskCode(text).includes('@assert-absence')).toBe(false);
    expect(scanMarkdown(text).masks.directives.includes('@assert-absence')).toBe(true);
  });

  it('indented code, raw-text HTML and front matter are not where directives are read', () => {
    for (const text of [doc('para', '', `    ${directive}`), doc('<pre>', directive, '</pre>'), doc('---', `x: ${directive}`, '---')]) {
      expect(maskCode(text).includes('@assert-absence'), text).toBe(true);
      expect(scanMarkdown(text).masks.directives.includes('@assert-absence'), text).toBe(false);
    }
  });

  it('a heading in a comment is not the title, and a setext heading is one', () => {
    const hidden = doc('<!--', '# Template title', '-->', '# Real title');
    expect(parseTitle(hidden)).toBe('Template title');
    expect(titleOf(scanMarkdown(hidden))?.text).toBe('Real title');
    const setext = doc('Real title', '==========');
    expect(parseTitle(setext)).toBeUndefined();
    expect(titleOf(scanMarkdown(setext))?.text).toBe('Real title');
  });
});
