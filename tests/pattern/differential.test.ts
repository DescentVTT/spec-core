/**
 * The three glob engines this module replaces, run beside it.
 *
 * Each tool's matcher, copied verbatim from its main branch into
 * `reference/`, answers the same questions as the dialect that replaces it.
 * Every answer that differs must fall into a category ADR-0003 names - a
 * defect fixed or a dialect unified - or the test fails and prints it. So the
 * behaviour changes each tool's users will see are exactly the ones written
 * down, and none arrives unexplained.
 *
 * Patterns and paths are lower case here: case is a policy change of its own,
 * tested by name at the end.
 */

import { describe, expect, it } from 'vitest';

import { parseGlob, type GlobOptions } from '../../src/pattern/index.js';
import * as brief from './reference/spec-brief-glob.js';
import * as graph from './reference/spec-graph-glob.js';
import * as guard from './reference/spec-guard-glob.js';

/** mulberry32: small, seeded, the same on every host. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = ['a', 'b', 'ab', '.', '*', '?', '[ab]', '[!a]', 'a*', '*b', '**', 'x**', '[a', '{a,b}', '{a,{b,.x}}', '{[,]a,b}'];

function genPattern(rand: () => number): string {
  const segments = 1 + Math.floor(rand() * 3);
  const out: string[] = [];
  for (let i = 0; i < segments; i += 1) {
    let name = '';
    const parts = 1 + Math.floor(rand() * 2);
    for (let j = 0; j < parts; j += 1) name += PIECES[Math.floor(rand() * PIECES.length)] as string;
    out.push(name);
  }
  let pattern = out.join('/');
  if (rand() < 0.1) pattern += '/';
  return pattern;
}

const PATHS = (() => {
  const names = ['a', 'b', 'ab', 'ba', '.x', 'a.b', 'x'];
  const out: string[] = [...names];
  for (const a of names) for (const b of names) out.push(`${a}/${b}`);
  for (const a of ['a', 'ab']) for (const b of names) for (const c of ['a', 'b', 'x']) out.push(`${a}/${b}/${c}`);
  return out;
})();

const PATTERNS = (() => {
  const rand = random(3);
  const out = new Set<string>(['src', '*.ts', 'src/**', 'tests', '*', 'a/**', 'a/**/b', '**/b', '**.b', 'a**b', 'a/[!b]', '{a,b}/**']);
  while (out.size < 400) out.add(genPattern(rand));
  return [...out];
})();

type Category = string;
type Answer = boolean | 'error';

interface Difference {
  readonly pattern: string;
  readonly path: string;
  readonly legacy: string;
  readonly core: string;
}

function report(rows: readonly Difference[]): string {
  return rows
    .slice(0, 12)
    .map((row) => `  "${row.pattern}" vs "${row.path}": legacy ${row.legacy}, core ${row.core}`)
    .join('\n');
}

/** `**` touching anything but a separator or an edge: a star in gitignore's reading. */
const GLOBSTAR_IN_SEGMENT = /(?:[^/{,]\*\*|\*\*[^/},])/;
const NEGATED_CLASS = /\[[!^]/;
const UNCLOSED_CLASS = /\[(?![^\]/]*\])/;
const CLASS_IN_BRACES = /\{[^}]*\[/;
const NESTED_BRACES = /\{[^}]*\{/;
const DOT_SEGMENT = /(?:^|\/)\.(?:\/|$)/;
const CLIMB = /(?:^|\/)\.\.(?:\/|$)/;
/** Ends in a directory's contents: a trailing slash or globstar. */
const CONTENTS = /(?:\*\*\/?|\/)$/;
const WHOLE_GLOBSTAR = /(?:^|\/)\*\*(?:\/|$)/;

/**
 * Differences every dialect shares with every legacy engine, by ADR-0003: a
 * `.` segment names nothing, a pattern that names no path or climbs out of
 * its root is an error, and a directory's contents do not include the
 * directory.
 */
function shared(pattern: string, legacy: Answer, core: Answer): Category | null {
  if (core === 'error' && (DOT_SEGMENT.test(pattern) || CLIMB.test(pattern))) return 'a pattern that names no path, or climbs out, is an error';
  if (DOT_SEGMENT.test(pattern)) return 'a . segment names nothing';
  if (CONTENTS.test(pattern) && legacy === true && core === false) return "a directory's contents do not include the directory";
  return null;
}

/**
 * Runs one legacy matcher and one dialect over every pattern and path, and
 * returns the differences nothing explains, with a count per category.
 */
function compare(
  legacy: (pattern: string) => ((path: string) => boolean) | 'error',
  options: GlobOptions,
  explain: (pattern: string, path: string, legacy: Answer, core: Answer) => Category | null,
): { unexplained: Difference[]; categories: Map<Category, number> } {
  const unexplained: Difference[] = [];
  const categories = new Map<Category, number>();
  const record = (category: Category | null, difference: Difference): void => {
    if (category === null) unexplained.push(difference);
    else categories.set(category, (categories.get(category) ?? 0) + 1);
  };
  for (const pattern of PATTERNS) {
    const old = legacy(pattern);
    const parsed = parseGlob(pattern, options);
    if (old === 'error' || !parsed.ok) {
      if ((old === 'error') !== !parsed.ok) {
        const category = explain(pattern, '', old === 'error' ? 'error' : true, parsed.ok ? true : 'error');
        record(category, { pattern, path: '(parse)', legacy: old === 'error' ? 'error' : 'ok', core: parsed.ok ? 'ok' : parsed.error });
      }
      continue;
    }
    for (const path of PATHS) {
      const a = old(path);
      const b = parsed.glob.match(path);
      if (a !== b) record(explain(pattern, path, a, b), { pattern, path, legacy: String(a), core: String(b) });
    }
  }
  return { unexplained, categories };
}

function hasExtension(name: string): boolean {
  return /.\.[^.]+$/.test(name);
}

function guarded(create: (patterns: readonly string[]) => (path: string) => boolean) {
  return (pattern: string): ((path: string) => boolean) | 'error' => {
    try {
      const matcher = create([pattern]);
      return (path) => matcher(path);
    } catch {
      return 'error';
    }
  };
}

describe('spec-brief, against the path dialect', () => {
  it('differs only where ADR-0003 says it does', () => {
    const result = compare(
      (pattern) => {
        const parsed = brief.parseGlob(pattern);
        return parsed.ok ? (path) => brief.matchGlob(parsed.glob, path) : 'error';
      },
      {
        dialect: 'path',
        caseSensitive: true,
        // spec-brief's reading of a literal with no tree to ask: a name with
        // an extension is a file, anything else a directory.
        literal: (path) => (hasExtension(path.slice(path.lastIndexOf('/') + 1)) ? 'file' : 'directory'),
      },
      (pattern, _path, legacy, core) => {
        const common = shared(pattern, legacy, core);
        if (common !== null) return common;
        // A literal read as a directory names what is beneath it, as a
        // trailing `/**` now does.
        if (legacy === true && core === false && !/[*?[\]]/.test(pattern)) return "a directory's contents do not include the directory";
        // spec-brief split a brace group on a comma inside a class.
        if (CLASS_IN_BRACES.test(pattern)) return 'a class inside braces';
        return null;
      },
    );
    expect(result.unexplained, `unexplained:\n${report(result.unexplained)}`).toEqual([]);
    expect(result.categories.get("a directory's contents do not include the directory")).toBeGreaterThan(0);
  });
});

describe('spec-graph, against the path dialect', () => {
  it('differs only where ADR-0003 says it does', () => {
    const result = compare(guarded(graph.createGlobMatcher), { dialect: 'path', caseSensitive: true, literal: 'either' }, (pattern, path, legacy, core) => {
      const common = shared(pattern, legacy, core);
      if (common !== null) return common;
      if (legacy !== 'error' && core === 'error' && UNCLOSED_CLASS.test(pattern)) return 'an unclosed class is an error';
      if (GLOBSTAR_IN_SEGMENT.test(pattern)) return 'a globstar inside a segment is a star';
      // spec-graph read any pattern with braces as a glob; spec-brief, and now
      // every tool, reads each expanded alternative with no glob syntax as a
      // literal, which may name a directory.
      if (/\{/.test(pattern) && legacy === false && core === true) return 'braces expand to literals';
      // spec-graph normalised a trailing slash away before it read the
      // pattern, so `dir*/` named the directory, not what it holds.
      if (pattern.endsWith('/') && legacy === false && core === true) return "a trailing slash names a directory's contents";
      if (NEGATED_CLASS.test(pattern) && path.includes('/')) return 'a class never matches a separator';
      if (WHOLE_GLOBSTAR.test(pattern) && legacy === true && core === false) return 'a globstar matches whole segments';
      return null;
    });
    expect(result.unexplained, `unexplained:\n${report(result.unexplained)}`).toEqual([]);
    expect(result.categories.get('a globstar inside a segment is a star')).toBeGreaterThan(0);
  });
});

function guardExplain(pattern: string, path: string, legacy: Answer, core: Answer): Category | null {
  const common = shared(pattern, legacy, core);
  if (common !== null) return common;
  if (core === 'error' && (UNCLOSED_CLASS.test(pattern) || /\{/.test(pattern))) return 'malformed is an error';
  if (GLOBSTAR_IN_SEGMENT.test(pattern)) return 'a globstar inside a segment is a star';
  if (NESTED_BRACES.test(pattern) || CLASS_IN_BRACES.test(pattern)) return 'braces nest';
  if (NEGATED_CLASS.test(pattern) && path.includes('/')) return 'a class never matches a separator';
  if (WHOLE_GLOBSTAR.test(pattern) && legacy !== core) return 'a globstar matches whole segments';
  return null;
}

describe('spec-guard glob=, against the ripgrep dialect', () => {
  it('differs only where ADR-0003 says it does', () => {
    const result = compare(guarded(guard.createGlobMatcher), { dialect: 'ripgrep', caseSensitive: true }, guardExplain);
    expect(result.unexplained, `unexplained:\n${report(result.unexplained)}`).toEqual([]);
    expect(result.categories.get('malformed is an error')).toBeGreaterThan(0);
  });
});

describe('spec-guard exclude=, against the gitignore dialect', () => {
  it('differs only where ADR-0003 says it does', () => {
    const result = compare(guarded(guard.createExcludeMatcher), { dialect: 'gitignore', caseSensitive: true }, guardExplain);
    expect(result.unexplained, `unexplained:\n${report(result.unexplained)}`).toEqual([]);
  });
});

describe('the table ADR-0001 opens with, now one answer per dialect', () => {
  const answer = (pattern: string, path: string, options: GlobOptions): boolean => {
    const parsed = parseGlob(pattern, options);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.glob.match(path);
  };

  it.each([
    ['src', 'src/a.ts', true, false, true],
    ['*.ts', 'src/a.ts', false, true, true],
    ['tests', 'packages/x/tests/a.ts', false, false, true],
    ['*', '.github/ci.yml', false, true, true],
  ])('%s against %s: path %s, ripgrep %s, gitignore %s', (pattern, path, asPath, asRipgrep, asGitignore) => {
    expect(answer(pattern, path, { dialect: 'path', caseSensitive: true })).toBe(asPath);
    expect(answer(pattern, path, { dialect: 'ripgrep', caseSensitive: true })).toBe(asRipgrep);
    expect(answer(pattern, path, { dialect: 'gitignore', caseSensitive: true })).toBe(asGitignore);
  });

  it('answers case the same on every host', () => {
    // spec-graph folded case on Windows only; a result must not depend on the host.
    expect(answer('src/**', 'SRC/A.ts', { dialect: 'path', caseSensitive: true })).toBe(false);
    expect(answer('src/**', 'SRC/A.ts', { dialect: 'path', caseSensitive: false })).toBe(true);
    expect(graph.createGlobMatcher(['src/**'])('SRC/A.ts')).toBe(process.platform === 'win32');
  });
});
