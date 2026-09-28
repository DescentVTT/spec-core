import { describe, expect, it } from 'vitest';

import {
  basename,
  dirname,
  extname,
  isAbsolutePath,
  isInside,
  isRelativeReference,
  joinPosix,
  normalise,
  normalisePosix,
  relativePath,
  resolveInside,
  segments,
  splitReference,
  toPosix,
} from '../src/path/index.js';

describe('repository paths', () => {
  it.each([
    ['docs/adr/0001.md', 'docs/adr/0001.md'],
    ['./docs//adr/./0001.md', 'docs/adr/0001.md'],
    ['docs\\adr\\0001.md', 'docs/adr/0001.md'],
    ['docs/adr/../README.md', 'docs/README.md'],
    ['docs/', 'docs'],
    ['.', ''],
    ['', ''],
  ])('normalise(%j) is %j', (input, expected) => {
    expect(normalise(input)).toBe(expected);
  });

  it.each(['../x', 'docs/../../x', '/etc/passwd', 'C:/x', 'C:x', '\\\\server\\share'])(
    'refuses %j, which is not inside the repository',
    (input) => {
      expect(normalise(input)).toBeNull();
    },
  );

  it('resolves inside a directory, and answers null for a climb out', () => {
    expect(resolveInside('briefs', '../docs/adr/0001.md')).toBe('docs/adr/0001.md');
    expect(resolveInside('briefs/archive', '../../README.md')).toBe('README.md');
    expect(resolveInside('briefs', '../../x')).toBeNull();
    expect(resolveInside('', 'a/./b')).toBe('a/b');
  });

  it('knows what lies inside a directory', () => {
    expect(isInside('src/a.ts', 'src')).toBe(true);
    expect(isInside('src', 'src')).toBe(true);
    expect(isInside('srcs/a.ts', 'src')).toBe(false);
    expect(isInside('anything', '')).toBe(true);
  });

  it('writes the relative path a link needs', () => {
    expect(relativePath('briefs/archive', 'briefs/002_x.md')).toBe('../002_x.md');
    expect(relativePath('briefs', 'docs/adr/0001.md')).toBe('../docs/adr/0001.md');
    expect(relativePath('docs', 'docs/adr/0001.md')).toBe('adr/0001.md');
    expect(relativePath('docs', 'docs')).toBe('.');
    expect(relativePath('', 'a/b')).toBe('a/b');
    expect(relativePath('a/b', '')).toBe('../..');
    expect(relativePath('a/b', 'a')).toBe('..');
  });

  it('splits paths into names', () => {
    expect(segments('./a//b/./c/')).toEqual(['a', 'b', 'c']);
    expect(dirname('a/b/c.md')).toBe('a/b');
    expect(dirname('c.md')).toBe('');
    expect(basename('a/b/c.md')).toBe('c.md');
    expect(basename('c.md')).toBe('c.md');
  });

  it('reads an extension, and not a hidden name as one', () => {
    expect(extname('a/b/README.MD')).toBe('.md');
    expect(extname('.github')).toBe('');
    expect(extname('.eslintrc.json')).toBe('.json');
    expect(extname('Makefile')).toBe('');
    expect(extname('a.b/c')).toBe('');
  });
});

describe('host paths and link destinations', () => {
  it('turns backslashes into slashes', () => {
    expect(toPosix('C:\\repo\\docs')).toBe('C:/repo/docs');
  });

  it.each([
    ['/etc', true],
    ['\\x', true],
    ['C:/x', true],
    ['c:x', true],
    ['docs/x', false],
    ['./x', false],
    ['', false],
  ])('isAbsolutePath(%j) is %s', (input, expected) => {
    expect(isAbsolutePath(input)).toBe(expected);
  });

  it.each([
    ['../docs/a.md', true],
    ['a.md#section', true],
    // A colon past the start names no scheme.
    ['guide.md#step:2', true],
    ['#section', false],
    ['', false],
    ['/root.md', false],
    ['https://example.com/a.md', false],
    ['mailto:someone@example.com', false],
    ['C:/x.md', false],
  ])('isRelativeReference(%j) is %s', (input, expected) => {
    expect(isRelativeReference(input)).toBe(expected);
  });

  it('separates a destination from its query and fragment', () => {
    expect(splitReference('a.md#b')).toEqual({ path: 'a.md', suffix: '#b' });
    expect(splitReference('a.md?x=1#b')).toEqual({ path: 'a.md', suffix: '?x=1#b' });
    expect(splitReference('a.md')).toEqual({ path: 'a.md', suffix: '' });
    // A fragment alone points into the file that holds it: no path.
    expect(splitReference('#usage')).toEqual({ path: '', suffix: '#usage' });
  });

  it('normalises general POSIX paths, keeping what a relative path climbs', () => {
    expect(normalisePosix('../a/./b/../c')).toBe('../a/c');
    expect(normalisePosix('a/../../b')).toBe('../b');
    expect(normalisePosix('/a/../../b')).toBe('/b');
    expect(normalisePosix('../../a')).toBe('../../a');
    expect(normalisePosix('/')).toBe('/');
    expect(joinPosix('a', '', 'b/../c')).toBe('a/c');
    expect(joinPosix('/root', 'x')).toBe('/root/x');
    // An empty part is nothing to join, not the root.
    expect(joinPosix('', 'docs/a.md')).toBe('docs/a.md');
  });
});
