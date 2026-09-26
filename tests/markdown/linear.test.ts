/**
 * Documents built to make a naive scanner quadratic.
 *
 * Each is scanned at one size and at sixteen times that size. Linear work
 * takes about sixteen times as long, work that grows with the square of the
 * input 256 times, and work that grows as its square root cubed - a paragraph
 * of backtick runs, each a different length - 64 times. The check allows 32
 * times and a fixed allowance for noise, so it holds on a slow machine and
 * under instrumentation, which slow both sizes alike, and a quadratic scan
 * still fails it.
 */

import { describe, expect, it } from 'vitest';

import { scanMarkdown, sectionsOf, type MarkdownScan } from '../../src/markdown/index.js';
import { fastest } from './timing.js';

/** Scans `make(1)` and `make(16)`, which must be about sixteen times as large, and compares. */
function expectLinear(make: (scale: number) => string, then: (scan: MarkdownScan) => void = () => {}): void {
  const small = make(1);
  const large = make(16);
  scanMarkdown(small);
  const once = fastest(3, () => scanMarkdown(small));
  let scan: MarkdownScan | undefined;
  const sixteen = fastest(2, () => {
    scan = scanMarkdown(large);
  });
  expect(sixteen).toBeLessThan(32 * once + 100);
  then(scan as MarkdownScan);
}

describe('linear time on hostile input', () => {
  it('backtick runs of every length, none closed, in one paragraph', () => {
    const make = (scale: number): string => {
      const parts: string[] = [];
      for (let k = 1; k <= 350 * Math.sqrt(scale); k += 1) parts.push(`${'`'.repeat(k)} x`);
      return parts.join(' ');
    };
    expectLinear(make, (s) => expect(s.codeSpans).toEqual([]));
  });

  it('the same, one run to a line', () => {
    const make = (scale: number): string => {
      const lines: string[] = [];
      for (let k = 1; k <= 350 * Math.sqrt(scale); k += 1) lines.push(`a ${'`'.repeat(k)} x`);
      return lines.join('\n');
    };
    expectLinear(make, (s) => expect(s.codeSpans).toEqual([]));
  });

  it('comments opened in the middle of lines and never closed', () => {
    expectLinear(
      (scale) => 'a <!-- b '.repeat(4000 * scale),
      (s) => expect(s.comments).toEqual([]),
    );
  });

  it('brackets nested deep, with a definition to look labels up in', () => {
    expectLinear(
      (scale) => `${'[ '.repeat(10_000 * scale)}x${' ]'.repeat(10_000 * scale)}\n\n[x]: y`,
      (s) => expect(s.links.map((l) => l.form)).toEqual(['shortcut', 'definition']),
    );
    // Two brackets together open a wiki link, which closes on the first `]]`.
    expect(scanMarkdown(`${'['.repeat(1000)}x${']'.repeat(1000)}`).links.map((l) => l.form)).toEqual(['wiki']);
  });

  it('link text full of images, and full of brackets that open nothing', () => {
    expectLinear(
      (scale) => `[${'![a](b.png) [c] '.repeat(5_000 * scale)}](d.md)`,
      (s) => expect(s.links.length).toBe(1 + 5_000 * 16),
    );
    expectLinear(
      // A space after the first `[` and before the last `]`: `[[` would open a wiki link.
      (scale) => `[ ${'[ '.repeat(10_000 * scale)}x${' ]'.repeat(10_000 * scale)} ](d.md)`,
      (s) => expect(s.links.map((l) => l.target)).toEqual(['d.md']),
    );
  });

  it('link destinations that never close', () => {
    const none = (s: MarkdownScan): void => expect(s.links).toEqual([]);
    expectLinear((scale) => '[a](b'.repeat(5000 * scale), none);
    expectLinear((scale) => '[a](<b '.repeat(3000 * scale), none);
    expectLinear((scale) => `[a](${'('.repeat(10_000 * scale)}`, none);
  });

  it('titles that never close', () => {
    const none = (s: MarkdownScan): void => expect(s.links).toEqual([]);
    expectLinear((scale) => '[a](b "x '.repeat(3000 * scale), none);
    expectLinear((scale) => "[a](b 'x ".repeat(3000 * scale), none);
    expectLinear((scale) => '[a](b (x '.repeat(3000 * scale), none);
  });

  it('wiki links and autolinks that never close', () => {
    const none = (s: MarkdownScan): void => expect(s.links).toEqual([]);
    expectLinear((scale) => '[[a '.repeat(5000 * scale), none);
    expectLinear((scale) => '<https:a'.repeat(3000 * scale), none);
  });

  it('long runs of one character where a heading, a rule, a table or a quote is read', () => {
    expectLinear((scale) => `#${' '.repeat(20_000 * scale)}x`);
    expectLinear((scale) => `${'-'.repeat(20_000 * scale)}x`);
    expectLinear((scale) => `a\n${'='.repeat(20_000 * scale)}`);
    expectLinear((scale) => `|${' '.repeat(20_000 * scale)}|\n|---|`);
    expectLinear((scale) => `${'>'.repeat(20_000 * scale)} a`);
    expectLinear((scale) => `- ${' '.repeat(20_000 * scale)}[x]`);
  });

  it('lists nested deep, and closed all at once', () => {
    const make = (scale: number): string => {
      const lines: string[] = [];
      for (let k = 0; k < 150 * Math.sqrt(scale); k += 1) lines.push(`${' '.repeat(k * 2)}- item`);
      lines.push('', 'text');
      return lines.join('\n');
    };
    expectLinear(make, (s) => expect(s.listItems.at(-1)?.depth).toBe(599));
  });

  it('many headings that slug alike, and their sections', () => {
    expectLinear(
      (scale) => `# top\n${'## same\n'.repeat(2500 * scale)}`,
      (s) => {
        expect(s.headings.at(-1)?.anchor).toBe('same-39999');
        const small = scanMarkdown(`# top\n${'## same\n'.repeat(2500)}`);
        sectionsOf(small);
        const once = fastest(3, () => sectionsOf(small));
        expect(fastest(2, () => sectionsOf(s))).toBeLessThan(32 * once + 100);
      },
    );
  });

  it('front matter that never closes', () => {
    expectLinear(
      (scale) => `---\n${'a: b\n'.repeat(5000 * scale)}`,
      (s) => expect(s.frontMatter).toBeNull(),
    );
  });
});
