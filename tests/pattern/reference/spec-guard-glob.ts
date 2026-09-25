// Verbatim from DescentVTT/spec-guard@d0ca38a src/glob.ts, lines 14-222: the matchers without the directory walk.
// The reference the differential test reads, never shipped.

import path from 'node:path';

const MAGIC_RE = /[*?[\]{}]/;

/** True when the pattern contains glob metacharacters. */
export function isGlob(pattern: string): boolean {
  return MAGIC_RE.test(pattern);
}

/** Normalises Windows separators so every internal path uses `/`. */
export function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

// No backslash on the list. `globToRegExp` runs its input through `toPosix`
// first, so by the time this is consulted there are no backslashes left to
// escape - an entry for one described a character that cannot arrive.
const REGEXP_SPECIALS = new Set(['.', '+', '^', '$', '(', ')', '|']);

/**
 * Converts a glob to an anchored RegExp.
 * Supports `*`, `**`, `?`, `[...]` and `{a,b}` - the subset every developer
 * already knows from .gitignore and ripgrep.
 */
export function globToRegExp(pattern: string, options: { ignoreCase?: boolean } = {}): RegExp {
  let source = '';
  let index = 0;
  const input = toPosix(pattern);

  while (index < input.length) {
    const char = input[index] as string;

    if (char === '*') {
      if (input[index + 1] === '*') {
        index += 2;
        if (input[index] === '/') {
          index += 1;
          source += '(?:[^/]*\\/)*';
        } else {
          source += '.*';
        }
        continue;
      }
      source += '[^/]*';
      index += 1;
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      index += 1;
      continue;
    }

    if (char === '[') {
      const close = input.indexOf(']', index + 1);
      if (close === -1) {
        source += '\\[';
        index += 1;
        continue;
      }
      let body = input.slice(index + 1, close);
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      source += `[${body}]`;
      index = close + 1;
      continue;
    }

    if (char === '{') {
      const close = input.indexOf('}', index + 1);
      if (close === -1) {
        source += '\\{';
        index += 1;
        continue;
      }
      const alternatives = input
        .slice(index + 1, close)
        .split(',')
        .map((alternative) => globToRegExp(alternative, options).source.slice(1, -1));
      source += `(?:${alternatives.join('|')})`;
      index = close + 1;
      continue;
    }

    source += REGEXP_SPECIALS.has(char) ? `\\${char}` : char;
    index += 1;
  }

  return new RegExp(`^${source}$`, options.ignoreCase ? 'i' : '');
}

/**
 * An include glob in the one form both engines are given: forward slashes, no
 * leading `./`, and a trailing slash read as everything under the directory.
 *
 * ripgrep used to be handed the glob as written, and matched nothing for
 * `./src/*.ts` or `src/` while the scanner matched the files. ADR-0014.
 */
export function normalizeGlob(pattern: string): string {
  const normalized = toPosix(pattern).replace(/^\.\//, '');
  return normalized.endsWith('/') ? `${normalized}**` : normalized;
}

/**
 * An `exclude` pattern in the one form both engines are given: forward slashes,
 * no leading `./` and no trailing slash. A leading `/` stays, because it means
 * something: see `createExcludeMatcher`.
 *
 * ripgrep used to be handed the pattern as written, and read three shapes
 * differently from the scanner. `./build` and `src\build` excluded nothing, and
 * `build/` did not exclude a file named `build`. ADR-0014.
 */
export function normalizeExclude(pattern: string): string {
  return toPosix(pattern).replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * Why an exclude pattern can never leave anything out, or null when it can.
 *
 * Each of these matched nothing under both engines, and nothing said so. The
 * one that matters is `!`: in `.gitignore` it re-includes a path, and a list
 * copied from one kept `build` and silently lost `!build/generated/needed.ts`,
 * so the exclusion was wider than the list reads. A `..` or a drive path points
 * outside the root, where nothing is searched, and `.` or `/` names the root
 * itself, which no path under it is.
 */
export function excludePatternError(pattern: string): string | null {
  const normalized = normalizeExclude(pattern);
  const reason = normalized.startsWith('!')
    ? 'negation patterns are not supported in exclude'
    : normalized.split('/').includes('..')
      ? '".." leads out of the root, and only paths inside it are searched'
      : /^[a-zA-Z]:\//.test(normalized)
        ? 'exclusions are relative to the root, and a drive path is not'
        : normalized === '' || normalized === '.'
          ? 'it names the root itself rather than a path under it'
          : null;
  return reason === null ? null : `invalid exclude pattern "${pattern}": ${reason}`;
}

/** The error for the first pattern in a list that can never exclude anything, or null. */
export function excludeListError(patterns: readonly string[]): string | null {
  for (const pattern of patterns) {
    const error = excludePatternError(pattern);
    if (error !== null) return error;
  }
  return null;
}

/**
 * Builds a predicate over root-relative POSIX paths.
 *
 * Following ripgrep's `-g` semantics, a pattern without a `/` is matched
 * against the file's basename (`*.ts` matches `src/deep/a.ts`), while a pattern
 * containing `/` is matched against the whole relative path.
 */
export function createGlobMatcher(patterns: readonly string[]): (relativePath: string) => boolean {
  if (patterns.length === 0) return () => true;

  const matchers = patterns.map((pattern) => {
    const normalized = normalizeGlob(pattern);
    const basenameOnly = !normalized.includes('/');
    return { regexp: globToRegExp(normalized), basenameOnly };
  });

  return (relativePath: string): boolean =>
    matchers.some(({ regexp, basenameOnly }) =>
      regexp.test(basenameOnly ? path.posix.basename(relativePath) : relativePath),
    );
}

/**
 * Builds a predicate for `exclude` patterns, following gitignore/ripgrep rules
 * rather than the include-filter rules above.
 *
 * The two are deliberately different, because users mean different things by
 * them. `glob="*.ts"` filters files. `exclude="tests"` means the tests
 * directory - everything under it - and `exclude="src/config"` means that
 * directory, not a file of that name. ripgrep's `-g !pattern` already behaves
 * this way; matching it here is what keeps the two engines from disagreeing.
 *
 * The rule is one line: a pattern without a slash is tested against every path
 * segment; a pattern with a slash is tested against the path and each of its
 * ancestor directories.
 *
 * A leading slash counts, as it does in `.gitignore`: `/build` is the `build`
 * at the root, where `build` is one at any depth. ripgrep always read it that
 * way, and the scanner used to match nothing for it, so a rule excluding
 * `/target` gave a different count on a tree large enough for `auto` to pick
 * ripgrep. The slash is not part of any path, so it is dropped once it has
 * anchored the pattern.
 */
export function createExcludeMatcher(patterns: readonly string[]): (relativePath: string) => boolean {
  if (patterns.length === 0) return () => false;

  const matchers = patterns.map((pattern) => {
    const normalized = normalizeExclude(pattern);
    return { regexp: globToRegExp(normalized.replace(/^\//, '')), anchored: normalized.includes('/') };
  });

  return (relativePath: string): boolean => {
    const segments = relativePath.split('/');
    return matchers.some(({ regexp, anchored }) => {
      if (!anchored) return segments.some((segment) => regexp.test(segment));
      for (let depth = segments.length; depth > 0; depth--) {
        if (regexp.test(segments.slice(0, depth).join('/'))) return true;
      }
      return false;
    });
  };
}
