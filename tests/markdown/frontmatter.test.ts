import { describe, expect, it } from 'vitest';

import {
  findEntry,
  frontMatterCloses,
  frontMatterKind,
  isNull,
  keyName,
  parseInline,
  readFrontMatter,
  removeEntry,
  renderScalar,
  setEntry,
  type FrontMatter,
  type ReadOptions,
  type YamlValue,
} from '../../src/markdown/index.js';

function read(text: string, options: ReadOptions = {}): FrontMatter {
  const fm = readFrontMatter(text, options);
  if (fm === null) throw new Error('expected front matter');
  return fm;
}

function value(text: string, key = 'k'): YamlValue {
  const entry = findEntry(read(text), key);
  if (entry === undefined) throw new Error(`no ${key}`);
  return entry.value;
}

const scalar = (text: string, quoted = false): YamlValue => ({ kind: 'scalar', scalar: { text, quoted } });
const reason = (v: YamlValue): string => (v.kind === 'unsupported' ? v.reason : `read as ${v.kind}`);

describe('the block', () => {
  it('is absent unless the first line is a delimiter', () => {
    expect(readFrontMatter('')).toBeNull();
    expect(readFrontMatter('# Title\n---')).toBeNull();
    expect(readFrontMatter(' ---\na: 1\n---')).toBeNull();
    expect(readFrontMatter('----\na: 1\n----')).toBeNull();
  });

  it('closes on --- or ..., with trailing spaces allowed', () => {
    expect(read('---\na: 1\n---').close).toBe(2);
    expect(read('--- \na: 1\n...  ').close).toBe(2);
    expect(read('---\na: 1\n+++\n---').close).toBe(3);
  });

  it('knows the delimiters of both kinds', () => {
    expect(frontMatterKind('---')).toBe('yaml');
    expect(frontMatterKind('+++ ')).toBe('toml');
    expect(frontMatterKind('...')).toBeNull();
    expect(frontMatterCloses('...', 'yaml')).toBe(true);
    expect(frontMatterCloses('+++', 'yaml')).toBe(false);
    expect(frontMatterCloses('+++', 'toml')).toBe(true);
    expect(frontMatterCloses('---', 'toml')).toBe(false);
  });

  it('reports a block that is never closed and reads nothing from it', () => {
    expect(read('---\na: 1\nb: 2')).toEqual({
      kind: 'yaml',
      close: -1,
      entries: [],
      problems: [{ line: 0, message: 'the front matter opened on line 1 is never closed' }],
    });
    expect(read('+++\na = 1').close).toBe(-1);
  });

  it('reports TOML as a block it does not read', () => {
    expect(read('+++\na = 1\n+++\nbody')).toEqual({
      kind: 'toml',
      close: 2,
      entries: [],
      problems: [{ line: 0, message: 'TOML front matter is not read; write YAML between "---" lines' }],
    });
  });

  it('skips blank and comment lines and records each entry with its lines', () => {
    const fm = read('---\n# a comment\n\nstatus: active\ndate: 2026-09-24\n---');
    expect(fm.entries.map((e) => [e.key, e.line, e.end])).toEqual([
      ['status', 3, 4],
      ['date', 4, 5],
    ]);
    expect(fm.problems).toEqual([]);
  });

  it('names keys case- and separator-insensitively', () => {
    expect(keyName('depends-on')).toBe('dependson');
    expect(keyName('Depends_On')).toBe('dependson');
    expect(findEntry(read('---\ndepends-on: [a]\n---'), 'dependsOn')?.key).toBe('depends-on');
    expect(findEntry(null, 'x')).toBeUndefined();
  });

  it('reports lines that are not entries, and duplicate keys', () => {
    const fm = read('---\njust text\n  indented\na: 1\nA: 2\n---');
    expect(fm.problems).toEqual([
      { line: 1, message: 'not a "key: value" line' },
      { line: 2, message: 'an indented line belongs to no key' },
      { line: 4, message: '"A" is declared twice (first on line 4)' },
    ]);
    expect(fm.entries.map((e) => e.key)).toEqual(['a', 'A']);
  });

  it('reads past a byte-order mark and counts offsets after it', () => {
    const fm = read('\uFEFF---\na: 1\n---');
    expect(fm.entries[0]).toMatchObject({ key: 'a', keyStart: 4, valueStart: 7, valueEnd: 8 });
  });
});

describe('offsets', () => {
  it('points at the key and at the value as written', () => {
    const text = '---\nstatus:  "accepted"  # why\nlist: [a, b]\nplain: word # c\nempty:\n---';
    const fm = read(text);
    const spans = fm.entries.map((e) => [e.key, text.slice(e.keyStart, e.keyStart + e.key.length), text.slice(e.valueStart, e.valueEnd)]);
    expect(spans).toEqual([
      ['status', 'status', '"accepted"'],
      ['list', 'list', '[a, b]'],
      ['plain', 'plain', 'word'],
      ['empty', 'empty', ''],
    ]);
    const empty = fm.entries[3];
    expect(empty?.valueStart).toBe(text.indexOf('empty:') + 'empty:'.length);
  });

  it('spans a block list from its first item to its last', () => {
    const text = '---\nk:\n  - one\n  - "two" # c\n---';
    const entry = read(text).entries[0];
    expect(text.slice(entry?.valueStart, entry?.valueEnd)).toBe('one\n  - "two"');
  });

  it('spans an unsupported value over what was written', () => {
    const text = '---\na: {x: 1} # c\nb:\n  folded\n  text  \nc: "open\n---';
    const fm = read(text);
    expect(fm.entries.map((e) => text.slice(e.valueStart, e.valueEnd))).toEqual(['{x: 1}', 'folded\n  text', '"open']);
  });

  it('spans the value on the key line of one that continues below it', () => {
    const text = '---\nk: first\n  second\n---';
    const entry = read(text).entries[0];
    expect(text.slice(entry?.valueStart, entry?.valueEnd)).toBe('first');
    expect(entry?.value.kind).toBe('unsupported');
  });

  it('counts offsets in a CRLF text as they are', () => {
    const text = '---\r\na: 1\r\nb: 2\r\n---\r\n';
    const fm = read(text);
    expect(fm.entries.map((e) => [e.line, e.keyStart, e.valueStart, text.slice(e.valueStart, e.valueEnd)])).toEqual([
      [1, 5, 8, '1'],
      [2, 11, 14, '2'],
    ]);
  });
});

describe('scalars', () => {
  it('reads plain values, keeping leading zeros and YAML 1.1 booleans as text', () => {
    expect(value('---\nk: 035\n---')).toEqual(scalar('035'));
    expect(value('---\nk: yes\n---')).toEqual(scalar('yes'));
    expect(value('---\nk: a value # comment\n---')).toEqual(scalar('a value'));
    expect(value('---\nk: a#b\n---')).toEqual(scalar('a#b'));
    expect(value('---\nk:    padded   \n---')).toEqual(scalar('padded'));
    expect(value('---\nk: http://x\n---')).toEqual(scalar('http://x'));
  });

  it('reads an empty value, and a comment-only value, as empty', () => {
    expect(value('---\nk:\n---')).toEqual(scalar(''));
    expect(value('---\nk: # nothing\n---')).toEqual(scalar(''));
  });

  it('reads double-quoted values with their escapes', () => {
    expect(value('---\nk: "a \\"b\\" \\\\ \\/ \\t\\n"\n---')).toEqual(scalar('a "b" \\ / \t\n', true));
    expect(value('---\nk: "\\x41\\u00e9\\U0001F600"\n---')).toEqual(
      scalar(`A${String.fromCharCode(0xe9)}${String.fromCodePoint(0x1f600)}`, true),
    );
    expect(value('---\nk: "\\0\\b\\f\\r"\n---')).toEqual(scalar(`${String.fromCharCode(0)}\b\f\r`, true));
    expect(value('---\nk: "a: b" # fine\n---')).toEqual(scalar('a: b', true));
  });

  it('reads single-quoted values, where two quotes are one', () => {
    expect(value("---\nk: 'it''s'\n---")).toEqual(scalar("it's", true));
    expect(value("---\nk: ''\n---")).toEqual(scalar('', true));
  });

  it('refuses what it cannot read faithfully, and says why', () => {
    const why = (text: string): string => reason(parseInline(text));
    expect(why('"open')).toBe('a double-quoted value is never closed');
    expect(why("'open")).toBe('a single-quoted value is never closed');
    expect(why('"a" b')).toBe('text follows a closing quote');
    expect(why('"a"#b')).toBe('text follows a closing quote');
    expect(why('"\\q"')).toBe('"\\q" is not an escape this reader knows');
    expect(why('"\\x4"')).toBe('"\\x" is not an escape this reader knows');
    expect(why('"\\uZZZZ"')).toBe('"\\u" is not an escape this reader knows');
    expect(why('"\\UFFFFFFFF"')).toBe('"\\UFFFFFFFF" is not a character');
    expect(why('{a: 1}')).toBe('inline mappings are not supported');
    expect(why('|')).toBe('block scalars are not supported; keep the value on one line');
    expect(why('>-')).toBe('block scalars are not supported; keep the value on one line');
    expect(why('&anchor x')).toBe('anchors, aliases and tags are not supported');
    expect(why('*alias')).toBe('anchors, aliases and tags are not supported');
    expect(why('!tag x')).toBe('anchors, aliases and tags are not supported');
    expect(why('@x')).toBe('a plain value cannot start with "@"; quote it');
    expect(why('`x`')).toBe('a plain value cannot start with "`"; quote it');
    expect(why('Brief 035: the title')).toBe('a plain value cannot contain ": "; quote it');
    expect(why('ends with:')).toBe('a plain value cannot contain ": "; quote it');
    expect(why('- a')).toBe('a list must start on the line after its key');
    expect(why('-')).toBe('a list must start on the line after its key');
    expect(why('-1')).toBe('read as scalar');
  });

  it('knows null in the core schema, and a quoted null is text', () => {
    for (const text of ['', '~', 'null', 'Null', 'NULL']) expect(isNull({ text, quoted: false })).toBe(true);
    expect(isNull({ text: 'null', quoted: true })).toBe(false);
    expect(isNull({ text: 'nil', quoted: false })).toBe(false);
  });
});

describe('lists', () => {
  it('reads inline lists, quoted items and a trailing comma', () => {
    expect(value('---\nk: [a, "b, c", \'d\']\n---')).toEqual({
      kind: 'list',
      items: [
        { text: 'a', quoted: false },
        { text: 'b, c', quoted: true },
        { text: 'd', quoted: true },
      ],
    });
    expect(value('---\nk: []\n---')).toEqual({ kind: 'list', items: [] });
    expect(value('---\nk: [ a , b, ]\n---')).toEqual({
      kind: 'list',
      items: [
        { text: 'a', quoted: false },
        { text: 'b', quoted: false },
      ],
    });
    expect(value('---\nk: [a] # c\n---')).toEqual({ kind: 'list', items: [{ text: 'a', quoted: false }] });
  });

  it('refuses inline lists it cannot read', () => {
    const why = (text: string): string => reason(parseInline(text));
    expect(why('[a, b')).toBe('an inline list is never closed; keep it on one line');
    expect(why('[a,')).toBe('an inline list is never closed; keep it on one line');
    expect(why('[a] b')).toBe('text follows the end of an inline list');
    expect(why('[[a]]')).toBe('nested lists and mappings are not supported');
    expect(why('[{a: 1}]')).toBe('nested lists and mappings are not supported');
    expect(why('[a, , b]')).toBe('an inline list has an empty item');
    expect(why('[, a]')).toBe('an inline list has an empty item');
    expect(why('["a" "b"]')).toBe('inline list items must be separated by commas');
    expect(why('["open]')).toBe('a double-quoted value is never closed');
    expect(why('[a: b]')).toBe('"a: b" needs quoting inside an inline list');
    expect(why('[a #b]')).toBe('"a #b" needs quoting inside an inline list');
    expect(why('[a[b]')).toBe('"a[b" needs quoting inside an inline list');
  });

  it('reads block lists, indented or not, and quoted items', () => {
    const expected = { kind: 'list', items: [{ text: 'a', quoted: false }, { text: 'b c', quoted: true }] };
    expect(value('---\nk:\n  - a\n  - "b c"\n---')).toEqual(expected);
    expect(value('---\nk:\n- a\n- "b c"\nnext: 1\n---')).toEqual(expected);
    expect(value('---\nk:\n  - a # one\n\n  # between\n  - "b c"\n---')).toEqual(expected);
  });

  it('ends a block list at the next key, and records where it ends', () => {
    const fm = read('---\nk:\n  - a\n\nnext: 1\n---');
    expect(fm.entries.map((e) => [e.key, e.line, e.end])).toEqual([
      ['k', 1, 3],
      ['next', 4, 5],
    ]);
  });

  it('refuses block values it cannot read', () => {
    const why = (text: string): string => reason(value(text));
    expect(why('---\nk:\n  sub: 1\n---')).toBe('nested mappings are not supported; flatten the key');
    expect(why('---\nk:\n  folded text\n---')).toBe('the value continues on the next line; keep it on one line, or quote it');
    expect(why('---\nk: first\n  second\n---')).toBe('the value continues on the next line; keep it on one line, or quote it');
    expect(why('---\nk:\n  - a\n    - b\n---')).toBe('a list item is continued or nested; keep each item on one line');
    expect(why('---\nk:\n  - a\n  more\n---')).toBe('a list item is continued or nested; keep each item on one line');
    expect(why('---\nk:\n  -\n---')).toBe('a list item is empty');
    expect(why('---\nk:\n  - # only a comment\n---')).toBe('a list item is empty');
    expect(why('---\nk:\n  - [a]\n---')).toBe('nested lists are not supported');
    expect(why('---\nk:\n  - {a: 1}\n---')).toBe('inline mappings are not supported');
  });
});

describe('one level of nesting, when asked for', () => {
  const text = [
    '---',
    'title: T',
    'links:',
    '  depends-on: [a, b]',
    '  # a comment',
    '  supersedes: x # old',
    '  related:',
    '  - c',
    '  - d',
    'after: 1',
    '---',
  ].join('\n');

  it('flattens the keys under a parent to parent.child, each with its lines and offsets', () => {
    const fm = read(text, { nested: true });
    expect(fm.problems).toEqual([]);
    expect(fm.entries.map((e) => [e.key, e.name, e.parent, e.line, e.end, text.slice(e.keyStart, e.valueEnd)])).toEqual([
      ['title', 'title', null, 1, 2, 'title: T'],
      ['links.depends-on', 'links.dependson', 'links', 3, 4, 'depends-on: [a, b]'],
      ['links.supersedes', 'links.supersedes', 'links', 5, 6, 'supersedes: x'],
      ['links.related', 'links.related', 'links', 6, 9, 'related:\n  - c\n  - d'],
      ['after', 'after', null, 9, 10, 'after: 1'],
    ]);
    expect(fm.entries[3]?.value).toEqual({ kind: 'list', items: [{ text: 'c', quoted: false }, { text: 'd', quoted: false }] });
    expect(findEntry(fm, 'Links.Depends_On')?.value.kind).toBe('list');
  });

  it('reads the parent as unsupported without the option', () => {
    const fm = read(text);
    expect(fm.entries.map((e) => e.key)).toEqual(['title', 'links', 'after']);
    expect(reason(fm.entries[1]?.value as YamlValue)).toBe('nested mappings are not supported; flatten the key');
  });

  it('reads no second level, and reports lines out of line with the keys', () => {
    // `e` is deeper than `d`, so it is part of the value of `d`.
    const deep = '---\na:\n  b:\n    c: 1\n  d: 2\n   e: 3\n x: 4\n  - f\n  g: 5\n---';
    const fm = read(deep, { nested: true });
    expect(fm.entries.map((e) => [e.key, reason(e.value)])).toEqual([
      ['a.b', 'only one level of nesting is read; flatten the key'],
      ['a.d', 'the value continues on the next line; keep it on one line, or quote it'],
      ['a.g', 'read as scalar'],
    ]);
    expect(fm.problems).toEqual([
      { line: 6, message: 'not a "key: value" line at the indentation of the keys before it' },
      { line: 7, message: 'not a "key: value" line at the indentation of the keys before it' },
    ]);
  });

  it('keeps a blank line inside a nested value', () => {
    const fm = read('---\na:\n  b:\n\n  - x\n\n  c: 1\n---', { nested: true });
    expect(fm.entries.map((e) => [e.key, e.line, e.end, e.value.kind])).toEqual([
      ['a.b', 2, 5, 'list'],
      ['a.c', 6, 7, 'scalar'],
    ]);
    expect(fm.problems).toEqual([]);
  });

  it('reports a key declared twice across the levels', () => {
    const fm = read('---\na:\n  b: 1\na.b: 2\na: 3\n---', { nested: true });
    expect(fm.problems).toEqual([
      { line: 3, message: '"a.b" is declared twice (first on line 3)' },
      { line: 4, message: '"a" is declared twice (first on line 2)' },
    ]);
  });

  it('edits a nested key in place, keeping its indentation', () => {
    const lines = text.split('\n');
    const fm = read(text, { nested: true });
    expect(setEntry(lines, fm, 'links.supersedes', 'y')).toEqual([...lines.slice(0, 5), '  supersedes: y', ...lines.slice(6)]);
    expect(removeEntry(lines, fm, 'links.related')).toEqual([...lines.slice(0, 6), ...lines.slice(9)]);
    expect(setEntry(lines, fm, 'links.new', 'z').slice(9, 12)).toEqual(['after: 1', 'links.new: z', '---']);
  });
});

describe('rendering', () => {
  it('writes plain words plain and anything ambiguous quoted', () => {
    expect(renderScalar('archived')).toBe('archived');
    expect(renderScalar('sha256-abc/+')).toBe('sha256-abc/+');
    expect(renderScalar('Two words')).toBe('Two words');
    expect(renderScalar('035')).toBe('"035"');
    expect(renderScalar('yes')).toBe('"yes"');
    expect(renderScalar('Null')).toBe('"Null"');
    expect(renderScalar('~')).toBe('"~"');
    expect(renderScalar('a: b')).toBe('"a: b"');
    expect(renderScalar('trailing ')).toBe('"trailing "');
    expect(renderScalar('')).toBe('""');
    expect(renderScalar('-x')).toBe('"-x"');
    expect(renderScalar('a.b_c d/e+f-9')).toBe('a.b_c d/e+f-9');
    expect(renderScalar('9x')).toBe('"9x"');
    expect(renderScalar('a,b')).toBe('"a,b"');
    for (const word of ['true', 'False', 'NULL', 'yes', 'No', 'on', 'OFF']) expect(renderScalar(word)).toBe(`"${word}"`);
    expect(renderScalar('online')).toBe('online');
  });

  it('round-trips what it renders', () => {
    for (const text of ['archived', '035', 'yes', 'a: b', 'say "hi"', "it's", 'tab\there', 'x #y']) {
      expect(parseInline(renderScalar(text))).toEqual(expect.objectContaining({ kind: 'scalar', scalar: expect.objectContaining({ text }) }));
    }
  });
});

describe('editing', () => {
  const lines = ['---', 'status: proposed', 'deps:', '  - a', '  - b', 'date: 2026-09-24', '---', '', '# T'];
  const fm = (): FrontMatter | null => readFrontMatter(lines.join('\n'));

  it('replaces an entry in place, keeping its key spelling and every other line', () => {
    expect(setEntry(lines, fm(), 'STATUS', 'archived')).toEqual(['---', 'status: archived', ...lines.slice(2)]);
    expect(setEntry(lines, fm(), 'deps', '[c]')).toEqual(['---', 'status: proposed', 'deps: [c]', 'date: 2026-09-24', '---', '', '# T']);
  });

  it('appends a new entry before the closing delimiter', () => {
    expect(setEntry(lines, fm(), 'integrity', 'x').slice(5, 8)).toEqual(['date: 2026-09-24', 'integrity: x', '---']);
  });

  it('adds a block to a file without one, and refuses an unclosed or a TOML one', () => {
    expect(setEntry(['# T'], null, 'status', 'active')).toEqual(['---', 'status: active', '---', '# T']);
    expect(() => setEntry(['---', 'a: 1'], readFrontMatter('---\na: 1'), 'b', '2')).toThrow('never closed');
    expect(() => setEntry(['+++', '+++'], readFrontMatter('+++\n+++'), 'b', '2')).toThrow('TOML');
  });

  it('removes an entry with its value lines, and a missing key changes nothing', () => {
    expect(removeEntry(lines, fm(), 'deps')).toEqual(['---', 'status: proposed', 'date: 2026-09-24', '---', '', '# T']);
    expect(removeEntry(lines, fm(), 'absent')).toEqual(lines);
    expect(removeEntry(['# T'], null, 'x')).toEqual(['# T']);
  });
});

describe('edges of the reader', () => {
  const nbsp = String.fromCharCode(0xa0);

  it('reads an empty block closed on the line after it opens', () => {
    expect(read('---\n---\n# T')).toEqual({ kind: 'yaml', close: 1, entries: [], problems: [] });
  });

  it('takes an unindented dash under a key as an item of its value', () => {
    expect(reason(value('---\nk:\n-\n---'))).toBe('a list item is empty');
    expect(reason(value('---\nk:\n- \n---'))).toBe('a list item is empty');
  });

  it('keeps a line of other whitespace under a key in its value', () => {
    expect(reason(value(`---\nk: a\n${nbsp}\n---`))).toBe('the value continues on the next line; keep it on one line, or quote it');
  });

  it('points an empty value just past its colon, wherever the colon is', () => {
    expect(read('---\nk :\n---').entries[0]).toMatchObject({ keyStart: 4, valueStart: 7, valueEnd: 7 });
  });

  it('reads a plain value holding a dash, and ends one at a comment after any spaces', () => {
    expect(value('---\nk: a - b\n---')).toEqual(scalar('a - b'));
    expect(value('---\nk: a  # two spaces\n---')).toEqual(scalar('a'));
    expect(value('---\nk: a#b # c\n---')).toEqual(scalar('a#b'));
  });

  it('refuses text after a closing quote unless a space and a # start it', () => {
    expect(reason(parseInline('"a"#b c'))).toBe('text follows a closing quote');
    expect(reason(parseInline('"a" x # c'))).toBe('text follows a closing quote');
    expect(parseInline('"a"   ')).toEqual(scalar('a', true));
    expect(parseInline('"a" #c')).toEqual(scalar('a', true));
  });

  it('reads escapes to their last digit, and no further', () => {
    const why = (text: string): string => reason(parseInline(text));
    expect(why('"\\x4')).toBe('"\\x" is not an escape this reader knows');
    expect(why('"\\xg1"')).toBe('"\\x" is not an escape this reader knows');
    expect(why('"\\u12"')).toBe('"\\u" is not an escape this reader knows');
    expect(why('"\\')).toBe('"\\" is not an escape this reader knows');
    expect(parseInline('"\\U0010FFFF"')).toEqual(scalar(String.fromCodePoint(0x10ffff), true));
    expect(why('"\\U00110000"')).toBe('"\\U00110000" is not a character');
    expect(parseInline('"\\x41b"')).toEqual(scalar('Ab', true));
  });

  it('reads a single-quoted value to its closing quote, and past a doubled one', () => {
    expect(parseInline("'a''' # c")).toEqual(scalar("a'", true));
    expect(reason(parseInline("'a''"))).toBe('a single-quoted value is never closed');
  });

  it('reads space around the items of an inline list, and refuses a colon at the end of one', () => {
    expect(parseInline('["a" , \'b\' ]')).toEqual({
      kind: 'list',
      items: [
        { text: 'a', quoted: true },
        { text: 'b', quoted: true },
      ],
    });
    expect(reason(parseInline('[a:]'))).toBe('"a:" needs quoting inside an inline list');
    expect(reason(parseInline('[a'))).toBe('an inline list is never closed; keep it on one line');
    expect(reason(parseInline('["a"'))).toBe('an inline list is never closed; keep it on one line');
    expect(reason(parseInline('["a" b]'))).toBe('inline list items must be separated by commas');
  });

  it('spans an unsupported block to the end of its last line, trailing spaces left out', () => {
    const text = '---\nb:\n  folded\n  text   \n---';
    const entry = read(text).entries[0];
    expect(text.slice(entry?.valueStart, entry?.valueEnd)).toBe('folded\n  text');
  });

  it('ends a nested value at a line indented less than the keys', () => {
    const fm = read('---\np:\n    c: 1\n  x  y\n---', { nested: true });
    expect(fm.entries.map((e) => [e.key, e.value])).toEqual([['p.c', scalar('1')]]);
    expect(fm.problems).toEqual([{ line: 3, message: 'not a "key: value" line at the indentation of the keys before it' }]);
  });

  it('reads a nested list with whitespace-only lines and dashes at the key indentation', () => {
    const fm = read('---\na:\n  b:\n  \n  - x\n  c:\n  -\n---', { nested: true });
    expect(fm.entries.map((e) => [e.key, e.value.kind === 'unsupported' ? e.value.reason : e.value.kind])).toEqual([
      ['a.b', 'list'],
      ['a.c', 'a list item is empty'],
    ]);
  });

  it('writes words that only start or end like reserved ones plainly', () => {
    expect(renderScalar('untrue')).toBe('untrue');
    expect(renderScalar('nothing')).toBe('nothing');
  });
});

describe('what a line of front matter must be, whole', () => {
  it('closes only on a line that is a delimiter, not on one ending like one', () => {
    expect(read('---\nk: ---\nb: 1\n---').close).toBe(3);
    expect(read('+++\nx +++\n+++').close).toBe(2);
  });

  it('reads a key only at the start of its line, and only with a space after its colon', () => {
    expect(read('---\n  k: v\n---')).toMatchObject({ entries: [], problems: [{ line: 1, message: 'an indented line belongs to no key' }] });
    expect(read('---\nkey:value\n---')).toMatchObject({ entries: [], problems: [{ line: 1, message: 'not a "key: value" line' }] });
  });

  it('reads a list item only where a dash opens the line and a space follows it', () => {
    expect(reason(value('---\nk:\n  text - more\n---'))).toBe('the value continues on the next line; keep it on one line, or quote it');
    expect(reason(value('---\nk:\n  -x\n---'))).toBe('the value continues on the next line; keep it on one line, or quote it');
    const text = '---\nk:\n  -   a\n---';
    const entry = read(text).entries[0];
    expect(text.slice(entry?.valueStart, entry?.valueEnd)).toBe('a');
  });
});
