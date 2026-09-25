// Verbatim from DescentVTT/spec-graph@2b2ddba src/glob.ts, lines 57-221: the matchers without the directory walk.
// Its imports point at spec-core, which holds the same functions: paths.ts's
// toPosix and normalisePosix, and regex.ts moved unchanged as compileRegex.
// The reference the differential test reads, never shipped.

import { normalisePosix, toPosix } from '../../../src/path/index.js';
import { compileRegex as compilePattern, type RegexMatcher as Matcher } from '../../../src/pattern/regex.js';

/** True when the string contains glob syntax rather than being a literal path. */
export function isGlob(pattern: string): boolean {
  return /[*?[\]{}]/.test(pattern);
}

/**
 * Compiles a glob to an anchored regular expression.
 *
 * `**` crosses directory separators; `*` and `?` do not. A trailing `/` or a
 * bare directory name matches everything beneath it, which is what people mean
 * when they write `--ignore drafts`.
 *
 * Nothing in the pipeline matches with this any more - see {@link compileGlob},
 * which gives the same answers without the backtracking. It stays for callers
 * who want a `RegExp`, and as the oracle the tests hold the automaton to.
 */
export function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${globSource(pattern)}$`, process.platform === 'win32' ? 'i' : '');
}

export interface GlobOptions {
  /** Fold case. Defaults to the host's convention: on for Windows, off elsewhere. */
  readonly ignoreCase?: boolean | undefined;
}

/**
 * Compiles a glob to the automaton every matcher here uses.
 *
 * A glob has no nested quantifiers, and ADR-0017 took that to mean there was no
 * backtracking hazard in handing one to `RegExp`. Nobody had timed it. Each
 * `*` is a `[^/]*`, and against a subject that fails to match, a backtracking
 * engine tries every way of dividing it between them - the subject's length to
 * the power of the stars:
 *
 * ```text
 *                                                              RegExp      here
 * **\/*-*-*-*.md   a 643-character hyphenated file name          2.3s     0.2ms
 * *-*-*-x          a 10,000-character reference target            120s     0.9ms
 * ```
 *
 * The first is bounded by the filesystem, which caps a name at 255 bytes. The
 * second is not: `--ignore-ref` patterns are matched against targets read out
 * of documents, and a document is whatever somebody wrote.
 */
export function compileGlob(pattern: string, options: GlobOptions = {}): Matcher {
  const source = globSource(pattern);
  try {
    return compilePattern(`^${source}$`, { ignoreCase: options.ignoreCase ?? process.platform === 'win32' });
  } catch (error) {
    // The message describes an expression the user never wrote, so it is told
    // against the glob they did.
    throw new Error(`invalid glob "${pattern}": ${(error as Error).message}`);
  }
}

/** The expression a glob stands for, before anchors and flags. */
function globSource(pattern: string): string {
  let source = '';
  let i = 0;
  const braces: number[] = [];

  while (i < pattern.length) {
    const ch = pattern[i] as string;

    if (ch === '*') {
      const doubled = pattern[i + 1] === '*';
      if (doubled) {
        const slashAfter = pattern[i + 2] === '/';
        // `a/**/b` must also match `a/b`, so the separator is folded in.
        source += slashAfter ? '(?:.*/)?' : '.*';
        i += slashAfter ? 3 : 2;
      } else {
        source += '[^/]*';
        i += 1;
      }
      continue;
    }

    if (ch === '?') {
      source += '[^/]';
      i += 1;
      continue;
    }

    if (ch === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close === -1) {
        source += '\\[';
        i += 1;
        continue;
      }
      const body = pattern.slice(i + 1, close);
      source += `[${body.startsWith('!') ? `^${escapeClass(body.slice(1))}` : escapeClass(body)}]`;
      i = close + 1;
      continue;
    }

    if (ch === '{') {
      braces.push(source.length);
      source += '(?:';
      i += 1;
      continue;
    }
    if (ch === '}' && braces.length > 0) {
      braces.pop();
      source += ')';
      i += 1;
      continue;
    }
    if (ch === ',' && braces.length > 0) {
      source += '|';
      i += 1;
      continue;
    }

    source += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }

  // Otherwise reported as an unmatched parenthesis, in a glob that has none.
  if (braces.length > 0) throw new Error(`invalid glob "${pattern}": unclosed "{"`);
  return source;
}

function escapeClass(body: string): string {
  return body.replace(/[\\^\]]/g, '\\$&');
}

export interface GlobMatcher {
  (path: string): boolean;
}

/**
 * Builds a matcher from include patterns, honouring `!` negations.
 *
 * Later patterns win, so `docs/**\/*.md` followed by `!docs/drafts/**` reads the
 * way a `.gitignore` does.
 */
export function createGlobMatcher(patterns: readonly string[]): GlobMatcher {
  const compiled = patterns.map((pattern) => {
    const negated = pattern.startsWith('!');
    const body = negated ? pattern.slice(1) : pattern;
    const normalised = normalisePosix(toPosix(body));
    // A bare directory means everything under it.
    const expanded = isGlob(normalised) ? normalised : `${normalised}/**`;
    return {
      negated,
      exact: isGlob(normalised) ? null : normalised.toLowerCase(),
      expression: compileGlob(expanded),
      direct: compileGlob(normalised),
    };
  });

  return (path: string): boolean => {
    let included = false;
    for (const entry of compiled) {
      const hit =
        entry.direct.test(path) ||
        entry.expression.test(path) ||
        (entry.exact !== null && entry.exact === path.toLowerCase());
      if (hit) included = !entry.negated;
    }
    return included;
  };
}
