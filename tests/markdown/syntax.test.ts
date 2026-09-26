import { describe, expect, it } from 'vitest';

import {
  atxLevel,
  fenceCloses,
  fenceOpen,
  hasRawTextClose,
  isRawTextOpen,
  isThematicBreak,
  leadIndex,
  listMarker,
  measureIndent,
  measureIndentAt,
  opensComment,
  setextUnderline,
  stripQuotes,
} from '../../src/markdown/syntax.js';

describe('indentation', () => {
  it('counts spaces as one column and a tab to the next multiple of four', () => {
    expect(measureIndent('')).toBe(0);
    expect(measureIndent('x')).toBe(0);
    expect(measureIndent('   x')).toBe(3);
    expect(measureIndent('\tx')).toBe(4);
    expect(measureIndent(' \tx')).toBe(4);
    expect(measureIndent('  \t x')).toBe(5);
    expect(measureIndent('    \tx')).toBe(8);
    expect(measureIndent('     ')).toBe(5);
  });

  it('measures from an offset and stops at a bound', () => {
    expect(measureIndentAt('ab  cd', 2, 6)).toBe(2);
    expect(measureIndentAt('ab    ', 2, 4)).toBe(2);
    expect(measureIndentAt('\t\t', 1, 2)).toBe(4);
  });

  it('finds the first character that is not a space or a tab', () => {
    expect(leadIndex('')).toBe(0);
    expect(leadIndex(' \t x')).toBe(3);
    expect(leadIndex('   ')).toBe(3);
    expect(leadIndex('x ')).toBe(0);
  });
});

describe('block-quote markers', () => {
  const strip = (line: string, max = Number.POSITIVE_INFINITY) => stripQuotes(line, 0, max);

  it('takes each marker with up to three spaces before it and one after', () => {
    expect(strip('> a')).toEqual({ contentStart: 2, depth: 1 });
    expect(strip('>a')).toEqual({ contentStart: 1, depth: 1 });
    expect(strip('   > a')).toEqual({ contentStart: 5, depth: 1 });
    expect(strip('> > a')).toEqual({ contentStart: 4, depth: 2 });
    expect(strip('>>  a')).toEqual({ contentStart: 3, depth: 2 });
    expect(strip('>  > a')).toEqual({ contentStart: 5, depth: 2 });
    // One space after the first marker, then four before the second: code.
    expect(strip('>     > a')).toEqual({ contentStart: 2, depth: 1 });
    expect(strip('\t> a')).toEqual({ contentStart: 3, depth: 1 });
  });

  it('does not take a marker after four spaces, or text that is not one', () => {
    expect(strip('    > a')).toEqual({ contentStart: 0, depth: 0 });
    expect(strip('a > b')).toEqual({ contentStart: 0, depth: 0 });
    expect(strip('')).toEqual({ contentStart: 0, depth: 0 });
    expect(strip('   ')).toEqual({ contentStart: 0, depth: 0 });
  });

  it('stops at the depth it is asked for', () => {
    expect(strip('> > a', 1)).toEqual({ contentStart: 2, depth: 1 });
    expect(strip('> > a', 0)).toEqual({ contentStart: 0, depth: 0 });
  });

  it('stops at the end of the line, a marker alone included', () => {
    expect(strip('>')).toEqual({ contentStart: 1, depth: 1 });
    expect(strip('> ')).toEqual({ contentStart: 2, depth: 1 });
    const text = '>\n> b';
    expect(stripQuotes(text, 0, 9)).toEqual({ contentStart: 1, depth: 1 });
    expect(stripQuotes('  \n>', 0, 9)).toEqual({ contentStart: 0, depth: 0 });
    expect(stripQuotes('>\n>', 0, 9)).toEqual({ contentStart: 1, depth: 1 });
  });
});

describe('code fences', () => {
  it('opens on three or more backticks or tildes, at any indentation', () => {
    expect(fenceOpen('```')).toEqual({ char: '`', length: 3, indent: 0, info: '' });
    expect(fenceOpen('~~~~ ts title ')).toEqual({ char: '~', length: 4, indent: 0, info: 'ts title' });
    expect(fenceOpen('      ```js')).toEqual({ char: '`', length: 3, indent: 6, info: 'js' });
    expect(fenceOpen('\t~~~')?.indent).toBe(4);
  });

  it('does not open on two, on a mixed run, or after text', () => {
    expect(fenceOpen('``')).toBeNull();
    expect(fenceOpen('~~')).toBeNull();
    expect(fenceOpen('`~`')).toBeNull();
    expect(fenceOpen('a ```')).toBeNull();
  });

  it('does not open a backtick fence whose info string holds a backtick', () => {
    expect(fenceOpen('```js`x')).toBeNull();
    expect(fenceOpen('``` `')).toBeNull();
    // Only a backtick fence: a tilde fence's info string may hold anything.
    expect(fenceOpen('~~~js`x')).toEqual({ char: '~', length: 3, indent: 0, info: 'js`x' });
  });

  it('closes on the same character, as long or longer, with nothing after', () => {
    const open = fenceOpen('````') as NonNullable<ReturnType<typeof fenceOpen>>;
    expect(fenceCloses('````', open)).toBe(true);
    expect(fenceCloses('`````  ', open)).toBe(true);
    expect(fenceCloses('```', open)).toBe(false);
    expect(fenceCloses('~~~~', open)).toBe(false);
    expect(fenceCloses('```` js', open)).toBe(false);
    expect(fenceCloses('x````', open)).toBe(false);
  });

  it('closes at most three columns deeper than it opened', () => {
    const open = fenceOpen('  ```') as NonNullable<ReturnType<typeof fenceOpen>>;
    expect(fenceCloses('```', open)).toBe(true);
    expect(fenceCloses('     ```', open)).toBe(true);
    expect(fenceCloses('      ```', open)).toBe(false);
  });
});

describe('ATX headings', () => {
  it('reads the level of one to six hashes followed by a space, a tab or nothing', () => {
    expect(atxLevel('# a')).toBe(1);
    expect(atxLevel('###### a')).toBe(6);
    expect(atxLevel('##\ta')).toBe(2);
    expect(atxLevel('#')).toBe(1);
    expect(atxLevel('   ## a')).toBe(2);
  });

  it('refuses seven hashes, no space, and four spaces of indentation or more', () => {
    expect(atxLevel('     # a')).toBe(0);
    expect(atxLevel('   \t# a')).toBe(0);
    expect(atxLevel('####### a')).toBe(0);
    expect(atxLevel('#a')).toBe(0);
    expect(atxLevel('#5 bolt')).toBe(0);
    expect(atxLevel('    # a')).toBe(0);
    expect(atxLevel('\t# a')).toBe(0);
    expect(atxLevel('a # b')).toBe(0);
    expect(atxLevel('')).toBe(0);
  });
});

describe('thematic breaks and setext underlines', () => {
  it('reads three or more of one mark, spaced or not', () => {
    for (const line of ['***', '---', '___', ' - - -', '   *\t*  *', '-----', '_ _ _ _']) {
      expect(isThematicBreak(line), line).toBe(true);
    }
  });

  it('refuses two marks, mixed marks, text, and four spaces of indentation', () => {
    for (const line of ['--', '*-*', '---a', '    ---', '     ---', '', '===', 'a---']) {
      expect(isThematicBreak(line), line).toBe(false);
    }
  });

  it('reads a run of = or - as an underline', () => {
    expect(setextUnderline('===')).toBe('=');
    expect(setextUnderline('=')).toBe('=');
    expect(setextUnderline('   ---  ')).toBe('-');
    expect(setextUnderline('--\t')).toBe('-');
  });

  it('refuses a broken run, text, a mixed run and four spaces', () => {
    expect(setextUnderline('- -')).toBeNull();
    expect(setextUnderline('== =')).toBeNull();
    expect(setextUnderline('=-')).toBeNull();
    expect(setextUnderline('---a')).toBeNull();
    expect(setextUnderline('    ---')).toBeNull();
    expect(setextUnderline('     ---')).toBeNull();
    expect(setextUnderline('***')).toBeNull();
    expect(setextUnderline('')).toBeNull();
  });
});

describe('list markers', () => {
  it('reads bullets and ordered markers with the width up to the text', () => {
    expect(listMarker('- a')).toEqual({ offset: 0, marker: '-', width: 2 });
    expect(listMarker('  * a')).toEqual({ offset: 2, marker: '*', width: 2 });
    expect(listMarker('+\ta')).toEqual({ offset: 0, marker: '+', width: 2 });
    expect(listMarker('12. a')).toEqual({ offset: 0, marker: '12.', width: 4 });
    expect(listMarker('3)   a')).toEqual({ offset: 0, marker: '3)', width: 5 });
    expect(listMarker('-')).toEqual({ offset: 0, marker: '-', width: 1 });
  });

  it('refuses a marker without a space, ten digits, and a thematic break', () => {
    expect(listMarker('-a')).toBeNull();
    expect(listMarker('1.a')).toBeNull();
    expect(listMarker('1234567890. a')).toBeNull();
    expect(listMarker('- - -')).toBeNull();
    expect(listMarker('* * *')).toBeNull();
    expect(listMarker('a - b')).toBeNull();
  });
});

describe('raw-text HTML and comments', () => {
  it('opens on the four raw-text elements, in any case', () => {
    for (const line of ['<pre>', '<script src="x">', '  <STYLE>', '<textarea', '<pre\tclass="a">']) {
      expect(isRawTextOpen(line), line).toBe(true);
    }
  });

  it('does not open on other elements or on a longer name', () => {
    for (const line of ['<div>', '<details>', '<prefix>', '<scripts>', 'text <pre>', '</pre>']) {
      expect(isRawTextOpen(line), line).toBe(false);
    }
  });

  it('closes on any of the four close tags', () => {
    expect(hasRawTextClose('x </PRE> y')).toBe(true);
    expect(hasRawTextClose('</script>')).toBe(true);
    expect(hasRawTextClose('</style>')).toBe(true);
    expect(hasRawTextClose('</textarea>')).toBe(true);
    expect(hasRawTextClose('</div>')).toBe(false);
    expect(hasRawTextClose('<pre>')).toBe(false);
  });

  it('knows a comment opening a line after at most three spaces', () => {
    expect(opensComment('<!-- a')).toBe(true);
    expect(opensComment('   <!--')).toBe(true);
    expect(opensComment('    <!--')).toBe(false);
    expect(opensComment('     <!--')).toBe(false);
    expect(opensComment('a <!--')).toBe(false);
    expect(opensComment('<!-')).toBe(false);
  });
});
