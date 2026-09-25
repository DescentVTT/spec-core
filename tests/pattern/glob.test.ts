import { describe, expect, it } from 'vitest';

import {
  compileGlob,
  globCovers,
  globWitness,
  isGlobSyntax,
  parseGlob,
  parseGlobList,
  GlobError,
  MAX_ALTERNATIVES,
  type GlobOptions,
} from '../../src/pattern/index.js';

const PATH: GlobOptions = { dialect: 'path', caseSensitive: true };
const RIPGREP: GlobOptions = { dialect: 'ripgrep', caseSensitive: true };
const GITIGNORE: GlobOptions = { dialect: 'gitignore', caseSensitive: true };

function matches(pattern: string, path: string, options: GlobOptions = PATH): boolean {
  return compileGlob(pattern, options).match(path);
}

function error(pattern: string, options: GlobOptions = PATH): string {
  const parsed = parseGlob(pattern, options);
  if (parsed.ok) throw new Error(`"${pattern}" parsed`);
  return parsed.error;
}

describe('the syntax every dialect shares', () => {
  it.each([
    ['src/*.ts', 'src/a.ts', true],
    ['src/*.ts', 'src/deep/a.ts', false],
    ['src/*.ts', 'src/.hidden.ts', true],
    ['src/?.ts', 'src/a.ts', true],
    ['src/?.ts', 'src/ab.ts', false],
    ['src/[ab].ts', 'src/b.ts', true],
    ['src/[ab].ts', 'src/c.ts', false],
    ['src/[!ab].ts', 'src/c.ts', true],
    ['src/[^ab].ts', 'src/a.ts', false],
    ['src/[a-c].ts', 'src/b.ts', true],
    ['src/[]a].ts', 'src/].ts', true],
    ['src/[a-].ts', 'src/-.ts', true],
    ['src/{a,b}.ts', 'src/b.ts', true],
    ['src/{a,b}.ts', 'src/c.ts', false],
    ['{src,lib}/**', 'lib/x/y.ts', true],
    ['src/{a,{b,c}}.ts', 'src/c.ts', true],
    ['src/{[,]x,y}.ts', 'src/,x.ts', true],
    ['src/{[,]x,y}.ts', 'src/y.ts', true],
    ['src/\\*.ts', 'src/*.ts', true],
    ['src/\\*.ts', 'src/a.ts', false],
    ['src/a}.ts', 'src/a}.ts', true],
    ['src/**.ts', 'src/a.ts', true],
    ['src/**.ts', 'src/deep/a.ts', false],
    ['./src/*.ts', 'src/a.ts', true],
    ['src//a.ts', 'src/a.ts', true],
    ['src/./a.ts', 'src/a.ts', true],
  ])('%s against %s is %s', (pattern, path, expected) => {
    expect(matches(pattern, path)).toBe(expected);
  });

  it('reads a globstar as whole directories, and a trailing one as at least one segment', () => {
    expect(matches('a/**/b', 'a/b')).toBe(true);
    expect(matches('a/**/b', 'a/x/y/b')).toBe(true);
    expect(matches('a/**/b', 'a/xb')).toBe(false);
    expect(matches('**/b', 'b')).toBe(true);
    expect(matches('**/b', 'x/y/b')).toBe(true);
    expect(matches('a/**', 'a/x')).toBe(true);
    expect(matches('a/**', 'a/x/y')).toBe(true);
    // The directory itself is not in its contents: this is what keeps a
    // collision witness from being a directory.
    expect(matches('a/**', 'a')).toBe(false);
    expect(matches('**', 'x')).toBe(true);
    expect(matches('**', 'x/y/z')).toBe(true);
    expect(matches('a/**/**/b', 'a/b')).toBe(true);
  });

  it('never lets a wildcard or a class cross a separator', () => {
    expect(matches('a*b', 'a/b')).toBe(false);
    expect(matches('a?b', 'a/b')).toBe(false);
    expect(matches('a[!x]b', 'a/b')).toBe(false);
  });

  it('counts characters as code points, so ? matches one whatever its encoding', () => {
    expect(matches('?.md', '\u{1F600}.md')).toBe(true);
    expect(matches('??.md', '\u{1F600}.md')).toBe(false);
    expect(matches('[\u{1F600}-\u{1F64F}].md', '\u{1F610}.md')).toBe(true);
  });

  it('takes case from the caller, the same on every host', () => {
    expect(matches('SRC/*.ts', 'src/a.ts', { dialect: 'path', caseSensitive: true })).toBe(false);
    expect(matches('SRC/*.ts', 'src/a.ts', { dialect: 'path', caseSensitive: false })).toBe(true);
    expect(matches('src/[A-C].ts', 'src/b.ts', { dialect: 'path', caseSensitive: false })).toBe(true);
    // A negated class refuses both cases of what it names.
    expect(matches('src/[!a].ts', 'src/A.ts', { dialect: 'path', caseSensitive: false })).toBe(false);
    expect(matches('\u00c9t\u00e9.md', '\u00e9T\u00c9.md', { dialect: 'path', caseSensitive: false })).toBe(true);
    // No single-character upper case: matches only itself.
    expect(matches('\u00df.md', 'SS.md', { dialect: 'path', caseSensitive: false })).toBe(false);
  });

  it.each([
    ['', 'the pattern is empty'],
    ['   ', 'the pattern is empty'],
    ['!src', 'a negated pattern is a list entry, not a glob; narrow the positive pattern'],
    ['src/+(a|b)', 'extended globs such as "+(a|b)" are not supported'],
    ['src/@(a)', 'extended globs such as "+(a|b)" are not supported'],
    ['src/[ab', 'a "[" is never closed'],
    ['src/[a/b]', 'a "[" is never closed'],
    ['src/{a,b', 'a "{" is never closed'],
    ['src/[z-a]', 'the range "z-a" runs backwards'],
    ['../src', 'a pattern cannot climb out of its root with ".."'],
    ['src\\app', '"\\" escapes glob syntax; separate directories with "/"'],
    ['src\\', '"\\" escapes glob syntax; separate directories with "/"'],
    ['.', 'the pattern names no path'],
    ['/', 'the pattern names the root itself, not a path under it'],
  ])('refuses %j: %s', (pattern, reason) => {
    expect(error(pattern)).toBe(reason);
  });

  it('refuses a brace explosion', () => {
    const pattern = Array.from({ length: 9 }, () => '{a,b}').join('');
    expect(error(pattern)).toBe(`the braces expand to more than ${MAX_ALTERNATIVES} patterns`);
    expect(parseGlob(Array.from({ length: 8 }, () => '{a,b}').join(''), PATH).ok).toBe(true);
  });

  it('throws a GlobError naming the pattern from compileGlob', () => {
    expect(() => compileGlob('src/[ab', PATH)).toThrow(GlobError);
    expect(() => compileGlob('src/[ab', PATH)).toThrow('invalid glob "src/[ab": a "[" is never closed');
  });

  it('reads backslashes as separators when told to', () => {
    const windows: GlobOptions = { dialect: 'path', caseSensitive: true, backslash: 'separator' };
    expect(matches('src\\app\\*.ts', 'src/app/a.ts', windows)).toBe(true);
    expect(parseGlob('src\\app', windows).ok).toBe(true);
  });

  it('knows glob syntax when it sees it', () => {
    expect(isGlobSyntax('src/*.ts')).toBe(true);
    expect(isGlobSyntax('src/{a,b}')).toBe(true);
    expect(isGlobSyntax('src/[ab]')).toBe(true);
    expect(isGlobSyntax('src/a.ts')).toBe(false);
  });
});

describe('the path dialect', () => {
  it('reads a literal as either a file or a directory unless told which', () => {
    expect(matches('src/auth', 'src/auth')).toBe(true);
    expect(matches('src/auth', 'src/auth/login.ts')).toBe(true);
    expect(matches('src/auth', 'src/authz.ts')).toBe(false);
    const file: GlobOptions = { ...PATH, literal: 'file' };
    expect(matches('src/auth', 'src/auth', file)).toBe(true);
    expect(matches('src/auth', 'src/auth/login.ts', file)).toBe(false);
    const directory: GlobOptions = { ...PATH, literal: 'directory' };
    expect(matches('src/auth', 'src/auth', directory)).toBe(false);
    expect(matches('src/auth', 'src/auth/login.ts', directory)).toBe(true);
  });

  it('asks a function about each literal path, braces expanded', () => {
    const asked: string[] = [];
    const glob = compileGlob('src/{a.ts,lib}', {
      ...PATH,
      literal: (path) => {
        asked.push(path);
        return path.endsWith('.ts') ? 'file' : 'directory';
      },
    });
    expect(asked).toEqual(['src/a.ts', 'src/lib']);
    expect(glob.match('src/a.ts')).toBe(true);
    expect(glob.match('src/a.ts/x')).toBe(false);
    expect(glob.match('src/lib/x.ts')).toBe(true);
    expect(glob.match('src/lib')).toBe(false);
  });

  it('never asks about a pattern with glob syntax, and reads a trailing slash as a directory', () => {
    const glob = compileGlob('src/*', { ...PATH, literal: () => { throw new Error('asked'); } });
    expect(glob.match('src/a')).toBe(true);
    expect(glob.match('src/a/b')).toBe(false);
    expect(matches('src/', 'src/a/b')).toBe(true);
    expect(matches('src/', 'src')).toBe(false);
  });

  it('roots a pattern with a leading slash at the root of the filesystem', () => {
    expect(matches('/repo/docs/*.md', '/repo/docs/a.md')).toBe(true);
    expect(matches('/repo/docs/*.md', 'repo/docs/a.md')).toBe(false);
    expect(matches('/C:/repo/*.md', '/C:/repo/a.md')).toBe(true);
  });

  it('names the directories a walk must enter', () => {
    expect(compileGlob('docs/adr/*.md', PATH).bases).toEqual(['docs/adr']);
    expect(compileGlob('docs/**/x.md', PATH).bases).toEqual(['docs']);
    expect(compileGlob('**/x.md', PATH).bases).toEqual(['']);
    expect(compileGlob('{docs,specs}/*.md', PATH).bases).toEqual(['docs', 'specs']);
    // A literal may be a file, so the walk starts at the directory holding it.
    expect(compileGlob('docs/adr/0001.md', PATH).bases).toEqual(['docs/adr']);
    expect(compileGlob('docs/adr', { ...PATH, literal: 'directory' }).bases).toEqual(['docs/adr']);
    expect(compileGlob('/repo/docs/*.md', PATH).bases).toEqual(['/repo/docs']);
  });
});

describe('the ripgrep dialect', () => {
  it('matches a pattern with no slash against the last segment at any depth', () => {
    expect(matches('*.ts', 'src/deep/a.ts', RIPGREP)).toBe(true);
    expect(matches('*.ts', 'a.ts', RIPGREP)).toBe(true);
    expect(matches('a.ts', 'src/a.ts', RIPGREP)).toBe(true);
    expect(matches('src', 'src/a.ts', RIPGREP)).toBe(false);
    expect(compileGlob('*.ts', RIPGREP).bases).toEqual(['']);
  });

  it('matches a pattern with a slash against the whole path', () => {
    expect(matches('src/*.ts', 'src/a.ts', RIPGREP)).toBe(true);
    expect(matches('src/*.ts', 'lib/src/a.ts', RIPGREP)).toBe(false);
    expect(matches('src/', 'src/a/b.ts', RIPGREP)).toBe(true);
    expect(matches('src/a.ts', 'src/a.ts/b', RIPGREP)).toBe(false);
  });

  it('treats each brace alternative on its own', () => {
    const glob = compileGlob('{*.ts,docs/*.md}', RIPGREP);
    expect(glob.match('deep/a.ts')).toBe(true);
    expect(glob.match('docs/a.md')).toBe(true);
    expect(glob.match('x/docs/a.md')).toBe(false);
  });
});

describe('the gitignore dialect', () => {
  it('matches a pattern with no slash against any segment, and everything beneath it', () => {
    expect(matches('tests', 'packages/x/tests/a.ts', GITIGNORE)).toBe(true);
    expect(matches('tests', 'tests', GITIGNORE)).toBe(true);
    expect(matches('tests', 'attests/a.ts', GITIGNORE)).toBe(false);
    expect(matches('*.log', 'a/b.log/c', GITIGNORE)).toBe(true);
  });

  it('anchors a pattern with a slash, or a leading one, at the root', () => {
    expect(matches('src/config', 'src/config/a.ts', GITIGNORE)).toBe(true);
    expect(matches('src/config', 'lib/src/config', GITIGNORE)).toBe(false);
    expect(matches('/build', 'build/a', GITIGNORE)).toBe(true);
    expect(matches('/build', 'x/build/a', GITIGNORE)).toBe(false);
    expect(matches('**/gen', 'a/b/gen/c.ts', GITIGNORE)).toBe(true);
  });

  it('reads a trailing slash as nothing more than the name', () => {
    expect(matches('build/', 'build', GITIGNORE)).toBe(true);
    expect(matches('build/', 'x/build/y', GITIGNORE)).toBe(true);
  });

  it('names no base for a floating pattern', () => {
    expect(compileGlob('tests', GITIGNORE).bases).toEqual(['']);
    expect(compileGlob('src/gen/*.ts', GITIGNORE).bases).toEqual(['src/gen']);
    expect(compileGlob('src/config', GITIGNORE).bases).toEqual(['src']);
  });
});

describe('a witness', () => {
  const glob = (pattern: string, options: GlobOptions = PATH) => compileGlob(pattern, options);

  it('is a shortest path both scopes match, spelled readably', () => {
    expect(globWitness([glob('src/**'), glob('**/*.ts')])).toEqual({ kind: 'found', path: 'src/.ts' });
    expect(globWitness([glob('docs/adr/**'), glob('docs/adr/**')])).toEqual({ kind: 'found', path: 'docs/adr/x' });
    expect(globWitness([glob('src/a.ts'), glob('src/**')])).toEqual({ kind: 'found', path: 'src/a.ts' });
    expect(globWitness([glob('src/[0-9]*'), glob('src/*9')])).toEqual({ kind: 'found', path: 'src/9' });
  });

  it('finds characters no readable one can stand in for', () => {
    // Only the point just past the end of a range lies in both: the search
    // must try the boundaries of every set, not a list of favourites.
    const char = (point: number): string => String.fromCodePoint(point);
    const beyond = `[!${char(0x01)}-${char(0xff)}]`;
    expect(globWitness([glob(beyond), glob(beyond)])).toEqual({ kind: 'found', path: char(0x100) });
    const cyrillic = glob(`[${char(0x400)}-${char(0x4ff)}]`);
    const narrow = glob(`[${char(0x450)}-${char(0x460)}]`);
    expect(globWitness([cyrillic, narrow])).toEqual({ kind: 'found', path: char(0x450) });
  });

  it('is a file, never a directory or an empty segment', () => {
    expect(globWitness([glob('a/*/b', PATH), glob('a/*/b', PATH)])).toEqual({ kind: 'found', path: 'a/x/b' });
    expect(globWitness([glob('*'), glob('.*')])).toEqual({ kind: 'found', path: '.x' });
  });

  it('proves there is none', () => {
    expect(globWitness([glob('src/**'), glob('lib/**')])).toEqual({ kind: 'none' });
    expect(globWitness([glob('src/a.ts', { ...PATH, literal: 'file' }), glob('**/x.ts')])).toEqual({ kind: 'none' });
    expect(globWitness([glob('*.ts'), glob('*.md')])).toEqual({ kind: 'none' });
  });

  it('avoids what either side protects', () => {
    const everything = glob('src/**');
    const schema = glob('src/db/schema.ts');
    expect(globWitness([everything, glob('src/db/**')], [schema])).toEqual({ kind: 'found', path: 'src/db/x' });
    expect(globWitness([everything, glob('src/db/schema.ts')], [schema])).toEqual({ kind: 'none' });
  });

  it('decides whether one scope lies inside others', () => {
    expect(globCovers([glob('src/**')], glob('src/db/schema.ts'))).toBe(true);
    expect(globCovers([glob('src/db/schema.ts')], glob('src/**'))).toBe(false);
    expect(globCovers([glob('src/*.ts'), glob('src/*.md')], glob('src/{a.ts,b.md}', { ...PATH, literal: 'file' }))).toBe(true);
    // Read as either, a literal also names everything beneath it, which no
    // pattern with a wildcard in its last segment covers.
    expect(globCovers([glob('src/*.ts')], glob('src/a.ts'))).toBe(false);
  });

  it('says undecided when the budget runs out, never a guess', () => {
    expect(globWitness([glob('src/**'), glob('**/*.ts')], [], 1)).toEqual({ kind: 'undecided' });
    expect(globCovers([glob('src/*.ts')], glob('src/**'), 1)).toBe('undecided');
  });

  it('refuses to compare scopes that ignore case', () => {
    expect(() => globWitness([compileGlob('a', { dialect: 'path', caseSensitive: false })])).toThrow(
      '"a" ignores case; scopes are compared case-sensitively',
    );
  });
});

describe('a list', () => {
  it('lets the last entry that matches decide, and a ! entry take paths back out', () => {
    const parsed = parseGlobList(['docs/**/*.md', '!docs/drafts/**', 'docs/drafts/keep.md'], PATH);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.list.match('docs/a.md')).toBe(true);
    expect(parsed.list.match('docs/drafts/b.md')).toBe(false);
    expect(parsed.list.match('docs/drafts/keep.md')).toBe(true);
    expect(parsed.list.match('src/a.ts')).toBe(false);
    expect(parsed.list.entries.map((e) => e.negated)).toEqual([false, true, false]);
  });

  it('names the entry that does not parse', () => {
    expect(parseGlobList(['docs/*.md', ' !docs/[x'], PATH)).toEqual({
      ok: false,
      error: '" !docs/[x": a "[" is never closed',
    });
  });
});

describe('cost', () => {
  it('matches in time linear in the path, whatever the pattern', () => {
    // A backtracking engine takes about 28 seconds on this; see the ADR.
    const glob = compileGlob('*-*-*-*-*-*x', RIPGREP);
    const name = `${'a-'.repeat(60)}y`;
    const started = performance.now();
    expect(glob.match(name)).toBe(false);
    expect(performance.now() - started).toBeLessThan(250);
  });
});
