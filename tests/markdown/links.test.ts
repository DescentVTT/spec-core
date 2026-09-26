import { describe, expect, it } from 'vitest';

import { scanMarkdown, type Link } from '../../src/markdown/index.js';

const doc = (...lines: string[]): string => lines.join('\n');
const links = (text: string): readonly Link[] => scanMarkdown(text).links;
/** Each link as [form, image, text, target, the target as its offsets delimit it]. */
const brief = (text: string): [string, boolean, string, string, string][] =>
  links(text).map((l) => [l.form, l.image, l.text, l.target, text.slice(l.targetStart, l.targetEnd)]);

describe('inline links', () => {
  it('reads the text, the destination and every offset', () => {
    expect(links('see [the spec](docs/a.md) here')).toEqual([
      { form: 'inline', image: false, text: 'the spec', target: 'docs/a.md', label: null, start: 4, end: 25, targetStart: 15, targetEnd: 24, line: 1 },
    ]);
  });

  it('reads an image, and a ! that is escaped as text', () => {
    expect(links('![alt](a.png)')[0]).toMatchObject({ form: 'inline', image: true, start: 0, text: 'alt', target: 'a.png' });
    expect(links('\\![alt](a.png)')[0]).toMatchObject({ image: false, start: 2 });
    expect(links('\\\\![alt](a.png)')[0]).toMatchObject({ image: true, start: 2 });
  });

  it('reads the inside of an angle-bracket destination, spaces and all', () => {
    expect(brief('[a](<my file.md>)')).toEqual([['inline', false, 'a', 'my file.md', 'my file.md']]);
    expect(links('[a](<b>)')[0]).toMatchObject({ targetStart: 5, targetEnd: 6, end: 8 });
    expect(links('[a](<b\\>c>)')[0]?.target).toBe('b\\>c');
  });

  it('refuses an angle-bracket destination that is never closed, holds a <, or breaks a line', () => {
    for (const text of ['[a](<b)', '[a](<b<c>)', '[a](<b\nc>)']) expect(links(text), text).toEqual([]);
  });

  it('keeps balanced parentheses and escapes in a bare destination', () => {
    expect(brief('[a](b(c)d)')[0]?.[3]).toBe('b(c)d');
    expect(brief('[a](b)c)')[0]?.[3]).toBe('b');
    expect(brief('[a](b\\)c)')[0]?.[3]).toBe('b\\)c');
    expect(brief('[a](b\\(c)')[0]?.[3]).toBe('b\\(c');
  });

  it('takes a title in any of its three quotings', () => {
    for (const text of ['[a](b "t")', "[a](b 't')", '[a](b (t))', '[a](b\n"t")', '[a]( b\n  "t\nu" )']) {
      expect(links(text), text).toMatchObject([{ form: 'inline', target: 'b', end: text.length }]);
    }
  });

  it('refuses what is not a destination and a title', () => {
    for (const text of ['[a](b c)', '[a](b "t" x)', '[a](b "t)', "[a](b 't)", '[a](b (t)', '[a](b (t(u)))', '[a]()', '[a](', '[a](b', '[a](\n\nb)']) {
      expect(links(text), text).toEqual([]);
    }
  });

  it('reads a quote touching the destination as part of it, as CommonMark does', () => {
    expect(brief('[a](b"t")')).toEqual([['inline', false, 'a', 'b"t"', 'b"t"']]);
  });

  it('reads a destination on the line after the parenthesis', () => {
    expect(links('[a](\nb)')[0]).toMatchObject({ target: 'b', targetStart: 5 });
    expect(links('[a](\r\nb)')[0]).toMatchObject({ target: 'b', targetStart: 6 });
  });

  it('finds a link inside brackets that are not one, and keeps nested brackets in its text', () => {
    expect(brief('[a [b](c) d]')).toEqual([['inline', false, 'b', 'c', 'c']]);
    expect(brief('[a [b] c](d)')).toEqual([['inline', false, 'a [b] c', 'd', 'd']]);
    expect(brief('\\[a](b)')).toEqual([]);
    expect(brief('[a\\](b)')).toEqual([]);
  });
});

describe('reference links and definitions', () => {
  it('reads a definition, its destination and its title', () => {
    expect(links('[Spec]: <docs/a b.md> "Title"')).toEqual([
      { form: 'definition', image: false, text: 'Spec', target: 'docs/a b.md', label: 'Spec', start: 0, end: 21, targetStart: 9, targetEnd: 20, line: 1 },
    ]);
    expect(links('   [x]:  y.md')[0]).toMatchObject({ start: 3, targetStart: 9, target: 'y.md' });
    expect(links("[x]: y 'a title'")[0]?.target).toBe('y');
    expect(links('[x]: y (a title)')[0]?.target).toBe('y');
    expect(links('[x]: y  "a title"  ')[0]?.target).toBe('y');
  });

  it('is not a definition when prose follows, when it is a footnote, or when the label is empty', () => {
    for (const text of ['[Note]: this matters', '[^1]: a footnote', '[ ]: x', '    [x]: y', 'a [x]: y', '[x]: <y>"t"', '[x]:']) {
      expect(links(text).filter((l) => l.form === 'definition'), text).toEqual([]);
    }
  });

  it('reads the full, collapsed and shortcut forms through the first definition', () => {
    const text = doc('[a][one], [One][], [ONE], ![img][one]', '', '[one]: first.md', '[one]: second.md');
    expect(brief(text)).toEqual([
      ['reference', false, 'a', 'first.md', 'first.md'],
      ['reference', false, 'One', 'first.md', 'first.md'],
      ['shortcut', false, 'ONE', 'first.md', 'first.md'],
      ['reference', true, 'img', 'first.md', 'first.md'],
      ['definition', false, 'one', 'first.md', 'first.md'],
      ['definition', false, 'one', 'second.md', 'second.md'],
    ]);
    expect(links(text).slice(0, 3).map((l) => l.label)).toEqual(['one', 'One', 'ONE']);
  });

  it('compares labels ignoring case and runs of whitespace', () => {
    expect(brief(doc('[a  b\tC]', '', '[A B c]: x'))[0]?.[0]).toBe('shortcut');
  });

  it('reads nothing through a label that is not defined', () => {
    expect(brief(doc('[a][nope] [nope][] [nope]', '[one]: x'))).toEqual([['definition', false, 'one', 'x', 'x']]);
    expect(brief('[a][b] [c]')).toEqual([]);
  });

  it('reads the second bracket of an undefined full reference on its own', () => {
    expect(brief(doc('[foo][bar][baz]', '', '[baz]: /url'))[0]).toEqual(['reference', false, 'bar', '/url', '/url']);
  });

  it('reads a bracket followed by what is not a destination as a shortcut', () => {
    expect(brief(doc('[foo](not a link)', '', '[foo]: /url'))[0]).toEqual(['shortcut', false, 'foo', '/url', '/url']);
    expect(brief(doc('[foo][', '', '[foo]: /url'))[0]).toEqual(['shortcut', false, 'foo', '/url', '/url']);
  });

  it('refuses a label longer than 999 characters', () => {
    const long = 'x'.repeat(1000);
    expect(brief(doc(`[${long}]`, '', `[${long}]: y`)).map((l) => l[0])).toEqual(['definition']);
    const fits = 'x'.repeat(999);
    expect(brief(doc(`[${fits}]`, '', `[${fits}]: y`)).map((l) => l[0])).toEqual(['shortcut', 'definition']);
    expect(brief(doc(`[a][${long}]`, '', `[${long}]: y`)).map((l) => l[0])).toEqual(['definition']);
  });

  it('does not read a definition as a shortcut to itself, or one after a comment', () => {
    expect(brief('[a]: b').map((l) => l[0])).toEqual(['definition']);
    expect(brief(doc('<!-- x', '-->[a]: b')).map((l) => l[0])).toEqual([]);
    expect(brief('> [a]: b')[0]?.[0]).toBe('definition');
  });
});

describe('autolinks and wiki links', () => {
  it('reads an autolink of the schemes a document links with', () => {
    expect(links('see <https://x.org/a?b=c> now')).toEqual([
      { form: 'autolink', image: false, text: '', target: 'https://x.org/a?b=c', label: null, start: 4, end: 25, targetStart: 5, targetEnd: 24, line: 1 },
    ]);
    expect(brief('<http://a> <ftp://b> <mailto:c@d>').map((l) => l[3])).toEqual(['http://a', 'ftp://b', 'mailto:c@d']);
  });

  it('is not an autolink with a space or a < inside, or another scheme', () => {
    expect(links('<https://a b> <https://a<b> <foo:bar> <https:>')).toEqual([]);
  });

  it('is not a second link inside a link', () => {
    expect(brief('[a](<https://x.org>)')).toEqual([['inline', false, 'a', 'https://x.org', 'https://x.org']]);
  });

  it('reads a wiki link, its target before any pipe', () => {
    expect(links('see [[ 0007-thing | Display ]].')).toEqual([
      { form: 'wiki', image: false, text: '0007-thing | Display', target: '0007-thing', label: null, start: 4, end: 30, targetStart: 7, targetEnd: 17, line: 1 },
    ]);
    expect(links('![[diagram.png]]')[0]).toMatchObject({ form: 'wiki', image: true, start: 0, target: 'diagram.png' });
  });

  it('is not a wiki link when empty or when the brackets close on another line', () => {
    expect(links('[[ ]]').filter((l) => l.form === 'wiki')).toEqual([]);
    expect(links('[[a\nb]]').filter((l) => l.form === 'wiki')).toEqual([]);
    expect(links('[[a]] [[b')).toHaveLength(1);
  });
});

describe('where links are read', () => {
  it('reads nothing in code or in a comment', () => {
    const text = doc('`[a](b)`', '```', '[c](d)', '```', '<!-- [e](f) -->', '', '    [g](h)', '', '<pre>[i](j)</pre>');
    expect(links(text)).toEqual([]);
  });

  it('pairs brackets across lines of a paragraph, and not across a blank line or a new block', () => {
    expect(brief('[a\nb](c)')[0]?.[2]).toBe('a\nb');
    expect(links('[a\n\nb](c)')).toEqual([]);
    expect(links('# [a\nb](c)')).toEqual([]);
    expect(links('- [a\n- b](c)')).toEqual([]);
  });

  it('gives each link its line and returns them in order', () => {
    const s = scanMarkdown(doc('[z]: z.md', 'a [x](x.md) <https://y>', '', '[[w]] [z]'));
    expect(s.links.map((l) => [l.form, l.line, l.start])).toEqual([
      ['definition', 1, 0],
      ['inline', 2, 12],
      ['autolink', 2, 22],
      ['wiki', 4, 35],
      ['shortcut', 4, 41],
    ]);
  });
});

describe('edges of the link reader', () => {
  it('folds case as CommonMark does, and keeps the spaces between words of a label', () => {
    const sharp = String.fromCharCode(0x1e9e);
    expect(brief(doc(`[${sharp}]`, '', '[SS]: /u'))[0]?.[0]).toBe('shortcut');
    expect(brief(doc('[ab]', '', '[a b]: /u')).map((l) => l[0])).toEqual(['definition']);
  });

  it('reads an escaped backslash as the end of an escape, not the start of one', () => {
    expect(brief('[a](b\\\\)c)')[0]?.[3]).toBe('b\\\\');
  });

  it('stops a bare destination at a control character, and an angle one at a line break', () => {
    expect(links(`[a](b${String.fromCharCode(127)}c)`)).toEqual([]);
    expect(links(`[a](<b${String.fromCharCode(13)}c>)`)).toEqual([]);
  });

  it('needs whitespace before a title, and a closing parenthesis after one', () => {
    expect(links('[a](<b>"t")')).toEqual([]);
    expect(links('[a](b c))')).toEqual([]);
    expect(links('[a](<b> "t" )')[0]).toMatchObject({ target: 'b', end: 13 });
  });

  it('reads a title in a later paragraph from that paragraph', () => {
    const text = doc('x', '', 'see [a](b "t (x)") and [c](d (t))');
    expect(brief(text).map((l) => l[3])).toEqual(['b', 'd']);
  });

  it('reads no wiki link that names nothing, and no link through a bracket never closed', () => {
    expect(links('[[|x]]').filter((l) => l.form === 'wiki')).toEqual([]);
    expect(brief(doc('[foo]: /u', '', 'see [foo')).map((l) => l[0])).toEqual(['definition']);
  });

  it('reads a second label of spaces as none, and trims a label that has words', () => {
    expect(links(doc('[a][ ]', '', '[a]: /u'))[0]).toMatchObject({ form: 'reference', label: 'a' });
    expect(links(doc('[x][ one ]', '', '[one]: /u'))[0]).toMatchObject({ form: 'reference', label: 'one', text: 'x' });
  });

  it('reads nothing on a definition line but the definition, a bracket in its title included', () => {
    expect(brief(doc('[a]: /u "see [b]"', '[b]: /v')).map((l) => l[0])).toEqual(['definition', 'definition']);
  });

  it('reads an image after other text on its line', () => {
    expect(links('x![a](b.png)')[0]).toMatchObject({ image: true, start: 1 });
  });
});

describe('offsets and labels, exactly', () => {
  it('points a wiki target past the whitespace before it, and trims a link text', () => {
    expect(links('[[  a |b]]')[0]).toMatchObject({ target: 'a', targetStart: 4, targetEnd: 5 });
    expect(links('[ spaced ](x)')[0]).toMatchObject({ text: 'spaced' });
    expect(links('[[a]][[b]]').map((l) => l.target)).toEqual(['a', 'b']);
  });

  it('reads a destination indented on the line after the parenthesis', () => {
    expect(links('[a](\n  b)')[0]).toMatchObject({ target: 'b', targetStart: 7 });
    expect(links('[a](  \n  b  \n  "t")')[0]).toMatchObject({ target: 'b', targetStart: 9 });
  });

  it('reads a second label of up to 999 spaces as none, and a longer one as no label', () => {
    const fits = doc(`[a][${' '.repeat(999)}]`, '', '[a]: /u');
    expect(links(fits)[0]).toMatchObject({ form: 'reference', label: 'a' });
    const long = doc(`[a][${' '.repeat(1000)}]`, '', '[a]: /u');
    expect(links(long).map((l) => l.form)).toEqual(['definition']);
  });
});
