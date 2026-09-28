/**
 * Invariants over generated documents: whatever the scanner decides, the
 * masks keep every offset, nothing in code or a comment is structure, and
 * the pieces it reports do not overlap and say what they are.
 *
 * Each check collects what is wrong and asserts once: an `expect` per
 * character costs more than the scan it checks.
 */

import { describe, expect, it } from 'vitest';

import { scanMarkdown, type MarkdownScan } from '../../src/markdown/index.js';
import { generate, random, WILD } from './corpus.js';
import { fastestInTurn, instrumented } from '../timing.js';

const LF = 10;
const CR = 13;
const SPACE = 32;

function documents(seed: number, count: number): string[] {
  const rand = random(seed);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) out.push(generate(rand, WILD, 4 + Math.floor(rand() * 14)));
  return out;
}

const corpus = documents(20260926, 200);

function eachDocument(check: (scan: MarkdownScan, text: string) => void): void {
  for (const text of corpus) {
    try {
      check(scanMarkdown(text), text);
    } catch (error) {
      throw new Error(`${(error as Error).message}\n--- document ---\n${text}`);
    }
  }
}

/** Offsets of a text a mask is blank at, from its ranges rather than its characters. */
function maskedOffsets(s: MarkdownScan, mask: 'structure' | 'prose' | 'directives'): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < s.text.length; i += 1) out.push(s.isMasked(i, mask));
  return out;
}

describe('masks', () => {
  it('keep the length of the text, every terminator, and every character they do not blank', () => {
    eachDocument((s, text) => {
      for (const mask of [s.masks.structure, s.masks.prose, s.masks.directives]) {
        expect(mask.length).toBe(text.length);
        const wrong: number[] = [];
        for (let i = 0; i < text.length; i += 1) {
          const ch = text.charCodeAt(i);
          const masked = mask.charCodeAt(i);
          const terminator = ch === LF || ch === CR;
          if (terminator ? masked !== ch : masked !== ch && masked !== SPACE) wrong.push(i);
        }
        expect(wrong).toEqual([]);
      }
    });
  });

  it('blank in structure exactly what either other mask blanks, and say so', () => {
    eachDocument((s, text) => {
      const structure = maskedOffsets(s, 'structure');
      const prose = maskedOffsets(s, 'prose');
      const directives = maskedOffsets(s, 'directives');
      const wrong: number[] = [];
      for (let i = 0; i < text.length; i += 1) {
        if (structure[i] !== (prose[i] || directives[i])) wrong.push(i);
        const ch = text.charCodeAt(i);
        if (ch === SPACE || ch === LF || ch === CR) continue;
        if ((s.masks.structure.charCodeAt(i) === SPACE) !== structure[i]) wrong.push(i);
        if ((s.masks.prose.charCodeAt(i) === SPACE) !== prose[i]) wrong.push(i);
        if ((s.masks.directives.charCodeAt(i) === SPACE) !== directives[i]) wrong.push(i);
      }
      expect(wrong).toEqual([]);
    });
  });
});

describe('what is structure', () => {
  it('starts no heading, item, link or table inside code or a comment', () => {
    eachDocument((s) => {
      const lead = (line: number): number => {
        const record = s.lines[line - 1]!;
        return record.contentStart + record.content.search(/\S/);
      };
      const wrong = [
        ...s.headings.filter((h) => s.isMasked(lead(h.line))),
        ...s.listItems.filter((item) => s.isMasked(item.markerStart)),
        ...s.links.filter((link) => s.isMasked(link.start)),
        ...s.tables.filter((table) => s.isMasked(lead(table.line)) && s.text.charAt(lead(table.line)) === '|'),
      ];
      expect(wrong).toEqual([]);
    });
  });

  it('reports code spans, comments and blocks that do not overlap and are what they say', () => {
    eachDocument((s, text) => {
      const pieces = [...s.blocks, ...s.codeSpans, ...s.comments].sort((a, b) => a.start - b.start);
      for (let i = 1; i < pieces.length; i += 1) expect(pieces[i]!.start).toBeGreaterThanOrEqual(pieces[i - 1]!.end);
      for (const span of s.codeSpans) {
        const body = text.slice(span.start, span.end);
        const open = /^`+/.exec(body)![0].length;
        expect(body.length).toBeGreaterThan(open);
        expect(/`+$/.exec(body)![0].length).toBe(open);
      }
      for (const comment of s.comments) {
        expect(text.startsWith('<!--', comment.start)).toBe(true);
        expect(text.slice(comment.innerStart, comment.innerStart + comment.inner.length)).toBe(comment.inner);
        if (comment.closed) expect(text.slice(comment.start, comment.end)).toMatch(/-->$/);
        else expect(comment.end).toBe(text.length);
      }
    });
  });

  it('marks as code or HTML exactly the lines of the blocks', () => {
    eachDocument((s) => {
      const inBlock = new Set<number>();
      for (const b of s.blocks) for (let line = b.line; line <= b.endLine; line += 1) inBlock.add(line);
      expect(s.lines.filter((line) => (line.code || line.html) !== inBlock.has(line.line)).map((l) => l.line)).toEqual([]);
    });
  });

  it('has one line record per line, in order', () => {
    eachDocument((s) => {
      expect(s.lines).toHaveLength(s.index.lineCount);
      const wrong = s.lines.filter((line, i) => line.line !== i + 1 || line.start !== s.index.lineStart(i + 1) || line.end !== s.index.lineEnd(i + 1));
      expect(wrong).toEqual([]);
    });
  });

  it('gives every link a target its offsets delimit, on the line it reports', () => {
    eachDocument((s, text) => {
      const wrong = s.links.filter(
        (link) => link.start >= link.end || text.slice(link.targetStart, link.targetEnd) !== link.target || s.index.positionAt(link.start).line !== link.line,
      );
      expect(wrong).toEqual([]);
    });
  });

  it('nests list items inside the items that enclose them', () => {
    eachDocument((s) => {
      for (const item of s.listItems) {
        expect(item.endLine).toBeGreaterThanOrEqual(item.line);
        const enclosing = s.listItems.filter((o) => o !== item && o.line < item.line && o.endLine >= item.endLine);
        expect(enclosing.length).toBeGreaterThanOrEqual(item.depth);
      }
    });
  });
});

describe('the reading does not depend on how lines end', () => {
  const shape = (s: MarkdownScan) => ({
    headings: s.headings.map((h) => [h.form, h.level, h.text, h.anchor, h.line]),
    items: s.listItems.map((i) => [i.line, i.endLine, i.depth, i.checkbox, i.firstLine]),
    links: s.links.map((l) => [l.form, l.image, l.target, l.line]),
    blocks: s.blocks.map((b) => [b.kind, b.line, b.endLine, b.closed]),
    comments: s.comments.map((c) => [c.line, c.closed]),
    tables: s.tables.map((t) => [t.line, t.endLine]),
  });

  it('finds the same things in a CRLF or CR copy, at the same lines', () => {
    for (const text of corpus.slice(0, 100)) {
      const expected = shape(scanMarkdown(text));
      expect(shape(scanMarkdown(text.replace(/\n/g, '\r\n'))), text).toEqual(expected);
      expect(shape(scanMarkdown(text.replace(/\n/g, '\r'))), text).toEqual(expected);
    }
  });

  it('finds the same things after a byte-order mark', () => {
    for (const text of corpus.slice(0, 50)) {
      const plain = scanMarkdown(text);
      const marked = scanMarkdown(`\uFEFF${text}`);
      expect(marked.bom).toBe(1);
      expect({ ...marked, isMasked: null, index: null, bom: 0 }).toEqual({ ...plain, isMasked: null, index: null });
    }
  });
});

describe('time', () => {
  it('scans a megabyte of generated Markdown in the time a sixteenth of it takes sixteen times over', () => {
    const rand = random(7);
    const parts: string[] = [];
    let size = 0;
    while (size < 1_000_000) {
      const part = generate(rand, WILD, 20);
      parts.push(part);
      size += part.length + 2;
    }
    const text = parts.join('\n\n');
    const sixteenth = parts.slice(0, Math.ceil(parts.length / 16)).join('\n\n');
    expect(scanMarkdown(text).headings.length).toBeGreaterThan(1000);
    // A ratio, which a slow or busy machine keeps: under a second, as this
    // said, was 915 ms on one running other suites. The same work takes about
    // as long either way, and ordinary documents hold none of the shapes that
    // make work grow as the square root of the input cubed, which the
    // documents built to be hostile hold to twice; this allows four times,
    // and work that grows with the square of it reads sixteen. Instrumented,
    // a megabyte scanned twice more for every mutant that reaches the scanner
    // costs a sweep most of an hour, and the hostile documents hold the scan
    // to linear time there.
    if (instrumented()) return;
    const whole = (markdown: string): void => {
      const scan = scanMarkdown(markdown);
      void scan.links;
      void scan.listItems;
      void scan.masks.directives;
    };
    whole(sixteenth);
    const [sixteenSmall, oneLarge] = fastestInTurn(
      2,
      () => {
        for (let i = 0; i < 16; i += 1) whole(sixteenth);
      },
      () => whole(text),
    ) as [number, number];
    expect(oneLarge).toBeLessThan(4 * sixteenSmall + 100);
  });
});
