/**
 * The glob engine against an oracle that shares none of its code.
 *
 * Patterns are generated as syntax trees and rendered to text; the engine
 * parses the text, the oracle reads the tree, and the oracle's matcher is the
 * definition written as a recursive search - exponential, obviously correct,
 * and never shipped. Witnesses are checked against every path up to a length:
 * a witness must satisfy what it claims, nothing shorter may, and `none` must
 * leave nothing satisfying.
 */

import { describe, expect, it } from 'vitest';

import { compileGlob, globWitness, type GlobDialect, type Glob, type LiteralReading } from '../../src/pattern/index.js';

type Tok =
  | { readonly k: 'lit'; readonly c: string }
  | { readonly k: 'any' }
  | { readonly k: 'star' }
  | { readonly k: 'class'; readonly negated: boolean; readonly chars: string };
type Step = { readonly k: 'gs' } | { readonly k: 'name'; readonly toks: readonly Tok[] };
/** As written: `dir` is a trailing slash, and only ever last. */
type Seg = Step | { readonly k: 'dir' };
type Alt = readonly Seg[];

interface Pattern {
  readonly alts: readonly Alt[];
  readonly text: string;
}

/** mulberry32: small, seeded, and the same on every host. */
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

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}

function genName(rand: () => number): Tok[] {
  const length = 1 + Math.floor(rand() * 3);
  const toks: Tok[] = [];
  for (let i = 0; i < length; i += 1) {
    const choice = pick<Tok>(rand, [
      { k: 'lit', c: 'a' },
      { k: 'lit', c: 'b' },
      { k: 'lit', c: '.' },
      { k: 'any' },
      { k: 'star' },
      { k: 'class', negated: false, chars: 'ab' },
      { k: 'class', negated: true, chars: 'a' },
    ]);
    // Two adjacent stars would render as a globstar segment.
    if (choice.k === 'star' && toks[toks.length - 1]?.k === 'star') continue;
    toks.push(choice);
  }
  // A name spelled only with dots is "." or "..", which is not a name.
  if (toks.every((t) => t.k === 'lit' && t.c === '.')) toks.push({ k: 'lit', c: 'a' });
  return toks;
}

function genAlt(rand: () => number): Seg[] {
  const count = 1 + Math.floor(rand() * 3);
  const segs: Seg[] = [];
  for (let i = 0; i < count; i += 1) segs.push(rand() < 0.22 ? { k: 'gs' } : { k: 'name', toks: genName(rand) });
  if (rand() < 0.15) segs.push({ k: 'dir' });
  return segs;
}

function renderTok(tok: Tok): string {
  switch (tok.k) {
    case 'lit':
      return tok.c;
    case 'any':
      return '?';
    case 'star':
      return '*';
    case 'class':
      return `[${tok.negated ? '!' : ''}${tok.chars}]`;
  }
}

function renderAlt(alt: Alt): string {
  return alt.map((seg) => (seg.k === 'gs' ? '**' : seg.k === 'dir' ? '' : seg.toks.map(renderTok).join(''))).join('/');
}

function genPattern(rand: () => number): Pattern {
  const alts = rand() < 0.2 ? [genAlt(rand), genAlt(rand)] : [genAlt(rand)];
  const text = alts.length === 1 ? renderAlt(alts[0] as Alt) : `{${alts.map(renderAlt).join(',')}}`;
  return { alts, text };
}

/* ------------------------------------------------------------------ oracle */

function tokMatches(tok: Tok, c: string): boolean {
  switch (tok.k) {
    case 'lit':
      return tok.c === c;
    case 'any':
      return true;
    case 'star':
      return true;
    case 'class':
      return tok.chars.includes(c) !== tok.negated;
  }
}

function nameMatches(toks: readonly Tok[], s: string, i = 0, j = 0): boolean {
  if (i === toks.length) return j === s.length;
  const tok = toks[i] as Tok;
  if (tok.k === 'star') {
    for (let k = j; k <= s.length; k += 1) if (nameMatches(toks, s, i + 1, k)) return true;
    return false;
  }
  return j < s.length && tokMatches(tok, s.charAt(j)) && nameMatches(toks, s, i + 1, j + 1);
}

function segsMatch(segs: readonly Step[], parts: readonly string[], i = 0, j = 0): boolean {
  if (i === segs.length) return j === parts.length;
  const seg = segs[i] as Step;
  if (seg.k === 'gs') {
    if (i === segs.length - 1) return parts.length - j >= 1;
    for (let k = j; k <= parts.length; k += 1) if (segsMatch(segs, parts, i + 1, k)) return true;
    return false;
  }
  return j < parts.length && nameMatches(seg.toks, parts[j] as string) && segsMatch(segs, parts, i + 1, j + 1);
}

function literalOf(alt: readonly Step[]): string[] | null {
  const out: string[] = [];
  for (const seg of alt) {
    if (seg.k !== 'name' || !seg.toks.every((t) => t.k === 'lit')) return null;
    out.push(seg.toks.map((t) => (t as { c: string }).c).join(''));
  }
  return out;
}

/**
 * An alternative with its trailing slash read by the definition: a
 * directory's contents, `dir/**`, except in an exclusion, where it is the name
 * alone and anchors nothing.
 */
function withoutSlash(written: Alt, dialect: GlobDialect): readonly Step[] {
  const steps = written.filter((seg): seg is Step => seg.k !== 'dir');
  return steps.length === written.length || dialect === 'gitignore' ? steps : [...steps, { k: 'gs' }];
}

function oracle(pattern: Pattern, dialect: GlobDialect, reading: LiteralReading, path: string): boolean {
  const parts = path.split('/');
  return pattern.alts.some((written) => {
    const alt = withoutSlash(written, dialect);
    const slashed = alt.length > 1;
    if (dialect === 'path') {
      const literal = literalOf(alt);
      if (literal === null) return segsMatch(alt, parts);
      const exact = parts.length === literal.length && literal.every((p, i) => parts[i] === p);
      const beneath = parts.length > literal.length && literal.every((p, i) => parts[i] === p);
      return reading === 'file' ? exact : reading === 'directory' ? beneath : exact || beneath;
    }
    if (dialect === 'ripgrep') {
      if (slashed) return segsMatch(alt, parts);
      for (let i = 0; i < parts.length; i += 1) if (segsMatch(alt, parts.slice(i))) return true;
      return false;
    }
    for (let i = 0; i < (slashed ? 1 : parts.length); i += 1) {
      for (let j = i + 1; j <= parts.length; j += 1) if (segsMatch(alt, parts.slice(i, j))) return true;
    }
    return false;
  });
}

/* -------------------------------------------------------------------- paths */

const SEGMENTS = (() => {
  const out: string[] = [];
  for (const a of 'ab.x') {
    out.push(a);
    for (const b of 'ab.x') out.push(a + b);
  }
  return out.filter((s) => s !== '.' && s !== '..');
})();

const PATHS = (() => {
  const out: string[] = [...SEGMENTS];
  for (const a of SEGMENTS) {
    for (const b of SEGMENTS) {
      out.push(`${a}/${b}`);
      for (const c of SEGMENTS) out.push(`${a}/${b}/${c}`);
    }
  }
  return out;
})();

/** Every canonical path over a small alphabet up to a length, shortest first. */
const SHORT_PATHS = (() => {
  const out: string[] = [];
  let frontier = [''];
  for (let length = 1; length <= 6; length += 1) {
    const next: string[] = [];
    for (const prefix of frontier) for (const c of 'abx./') next.push(prefix + c);
    for (const candidate of next) {
      const parts = candidate.split('/');
      if (parts.every((p) => p !== '' && p !== '.' && p !== '..')) out.push(candidate);
    }
    frontier = next;
  }
  return out;
})();

/* -------------------------------------------------------------------- tests */

describe('matching agrees with the oracle', () => {
  const cases: [GlobDialect, LiteralReading][] = [
    ['path', 'either'],
    ['path', 'file'],
    ['path', 'directory'],
    ['ripgrep', 'either'],
    ['gitignore', 'either'],
  ];
  it.each(cases)('in the %s dialect, literals read as %s', (dialect, reading) => {
    const rand = random(dialect.length * 7919 + reading.length);
    for (let n = 0; n < 60; n += 1) {
      const pattern = genPattern(rand);
      const glob = compileGlob(pattern.text, { dialect, caseSensitive: true, literal: reading });
      for (const path of PATHS) {
        const expected = oracle(pattern, dialect, reading, path);
        if (glob.match(path) !== expected) {
          throw new Error(`${dialect}/${reading}: "${pattern.text}" against "${path}" should be ${expected}`);
        }
      }
    }
  });
});

describe('witnesses agree with enumeration', () => {
  it('for two scopes, and for two scopes less a protected one', () => {
    const rand = random(20260926);
    let found = 0;
    let none = 0;
    for (let n = 0; n < 250; n += 1) {
      const patterns = [genPattern(rand), genPattern(rand)];
      const excluded = rand() < 0.4 ? [genPattern(rand)] : [];
      const globs: Glob[] = patterns.map((p) => compileGlob(p.text, { dialect: 'path', caseSensitive: true }));
      const avoid: Glob[] = excluded.map((p) => compileGlob(p.text, { dialect: 'path', caseSensitive: true }));
      const satisfies = (path: string): boolean =>
        patterns.every((p) => oracle(p, 'path', 'either', path)) &&
        excluded.every((p) => !oracle(p, 'path', 'either', path));
      const label = `${patterns.map((p) => p.text).join(' & ')}${excluded.length > 0 ? ` less ${excluded[0]?.text}` : ''}`;

      const witness = globWitness(globs, avoid);
      if (witness.kind === 'undecided') throw new Error(`${label}: undecided`);
      if (witness.kind === 'found') {
        found += 1;
        expect(satisfies(witness.path), `${label}: ${witness.path} does not satisfy`).toBe(true);
        expect(witness.path.split('/').every((p) => p !== '' && p !== '.' && p !== '..'), label).toBe(true);
        const shorter = SHORT_PATHS.find((path) => path.length < witness.path.length && satisfies(path));
        expect(shorter, `${label}: ${shorter} is shorter than ${witness.path}`).toBeUndefined();
      } else {
        none += 1;
        const counter = SHORT_PATHS.find(satisfies);
        expect(counter, `${label}: ${counter} satisfies, yet none was reported`).toBeUndefined();
      }
    }
    // Both answers are exercised, or the property says little.
    expect(found).toBeGreaterThan(40);
    expect(none).toBeGreaterThan(40);
  });
});
