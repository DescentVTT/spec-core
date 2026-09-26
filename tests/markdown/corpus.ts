/**
 * Generated Markdown, for the property tests and the differential suites.
 *
 * A document is built from fragments. The `wild` fragments aim at the places
 * scanners disagree: fences with backticks in their info strings, comments
 * opened inside code spans, spans inside comments, stray backticks, unclosed
 * constructs, lazy lines, block quotes. The `plain` fragments stay inside
 * what every one of the old scanners reads correctly, so a differential
 * suite can demand exact agreement on them.
 */

/** mulberry32: small, seeded, and the same on every host. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

export function pick<T>(rand: Rand, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}

function chance(rand: Rand, p: number): boolean {
  return rand() < p;
}

const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'Spec', 'the', 'rule', 'x', 'ADR-0007', 'Über', 'naïve'];

function words(rand: Rand, max = 4): string {
  const count = 1 + Math.floor(rand() * max);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) out.push(pick(rand, WORDS));
  return out.join(' ');
}

function path(rand: Rand): string {
  return pick(rand, ['a.md', 'docs/b.md', '../c.md', 'd.md#part', 'https://x.org/e', 'f(1).md', 'img/g.png']);
}

/** Inline text every scanner reads the same way: spans closed on their line, well-formed links. */
function plainInline(rand: Rand): string {
  const parts: string[] = [words(rand)];
  const extras = Math.floor(rand() * 3);
  for (let i = 0; i < extras; i += 1) {
    parts.push(
      pick(rand, [
        `\`${words(rand, 2)}\``,
        `\`\`a \` b\`\``,
        `[${words(rand, 2)}](${path(rand)})`,
        `![${words(rand, 1)}](${path(rand)})`,
        `<!-- ${words(rand, 2)} -->`,
        words(rand),
      ]),
    );
  }
  return parts.join(' ');
}

/** Inline text aimed at the disagreements. */
function wildInline(rand: Rand): string {
  const parts: string[] = [words(rand, 2)];
  const extras = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < extras; i += 1) {
    parts.push(
      pick(rand, [
        '`<!--`',
        '`-->`',
        '<!-- `a -->',
        '<!-- x',
        '-->',
        '`',
        '``',
        '\\`',
        '\\<!-- no -->',
        '<!-->',
        '<!--->',
        `[${words(rand, 1)}]`,
        `[${words(rand, 1)}][ref]`,
        '[ref][]',
        '[ref]',
        `[[${words(rand, 1)}|shown]]`,
        '![[embed.png]]',
        '<https://auto.link/x>',
        `[t](<${path(rand)}> "title")`,
        `[t](${path(rand)} 'title')`,
        '[t](no title here)',
        '[a [nested](n.md) b]',
        '](',
        '[',
        ']',
        '# not a heading',
        '| pipe |',
        'C#',
        plainInline(rand),
      ]),
    );
  }
  return parts.join(pick(rand, [' ', '', '  ']));
}

export interface Profile {
  /** Fragments aimed at disagreements. */
  readonly wild: boolean;
  /** Setext headings. */
  readonly setext: boolean;
  /** Indented code blocks. */
  readonly indented: boolean;
  /** Block quotes. */
  readonly quotes: boolean;
  /** Comments that span lines. */
  readonly blockComments: boolean;
  /** Headings inside comments. */
  readonly hiddenHeadings: boolean;
  /** Tables. */
  readonly tables: boolean;
  /** Reference definitions and their uses. */
  readonly references: boolean;
  /** Raw-text HTML blocks. */
  readonly html: boolean;
  /** Front matter at the top. */
  readonly frontMatter: boolean;
  /** Level-one headings. */
  readonly titles: boolean;
}

export const WILD: Profile = {
  wild: true,
  setext: true,
  indented: true,
  quotes: true,
  blockComments: true,
  hiddenHeadings: true,
  tables: true,
  references: true,
  html: true,
  frontMatter: true,
  titles: true,
};

type Fragment = (rand: Rand) => string[];

function fragments(profile: Profile): Fragment[] {
  const out: Fragment[] = [
    (rand) => [`${'#'.repeat(profile.titles ? 1 + Math.floor(rand() * 6) : 2 + Math.floor(rand() * 5))} ${words(rand)}${chance(rand, 0.2) ? ' ##' : ''}`],
    (rand) => {
      const lines = [plainInline(rand)];
      if (chance(rand, 0.4)) lines.push(plainInline(rand));
      return lines;
    },
    (rand) => {
      const lines: string[] = [];
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i += 1) {
        const marker = pick(rand, ['-', '*', '1.', '2)']);
        const box = pick(rand, ['', '[ ] ', '[x] ', '[X] ']);
        lines.push(`${marker} ${box}${plainInline(rand)}`);
        if (chance(rand, 0.3)) lines.push(`  ${plainInline(rand)}`);
        if (chance(rand, 0.3)) lines.push(`  - ${pick(rand, ['', '[ ] '])}${words(rand)}`);
      }
      return lines;
    },
    (rand) => {
      const fence = pick(rand, ['```', '~~~', '````']);
      const info = pick(rand, ['', 'ts', 'md title']);
      const body = pick(rand, [['# not a heading'], ['- [ ] not a task', '[x](not-a-link.md)'], ['<!-- not a comment -->'], ['`a`']]);
      return [`${fence}${info}`, ...body, fence];
    },
    (rand) => [pick(rand, ['***', '___', '- - -'].slice(0, profile.wild ? 3 : 2))],
  ];
  if (profile.blockComments) {
    out.push((rand) => ['<!--', ...(profile.hiddenHeadings ? [`## ${words(rand)}`, '- [ ] hidden'] : [words(rand)]), '-->']);
  }
  if (profile.tables) {
    out.push((rand) => [`| ${words(rand, 1)} | ${words(rand, 1)} |`, '|---|:--:|', `| \`a|b\` | [x](${path(rand)}) |`, `| 1 | ${words(rand, 2)} |`]);
  }
  if (profile.references) {
    out.push((rand) => [`[${pick(rand, ['ref', 'Other', 'x'])}]: ${path(rand)}`]);
    out.push((rand) => [`see [ref] and [text][ref] and [Other][] ${words(rand)}`]);
  }
  if (profile.setext) out.push((rand) => [words(rand), pick(rand, profile.titles ? ['===', '---'] : ['---'])]);
  if (profile.quotes) out.push((rand) => [`> ${plainInline(rand)}`, `> ${plainInline(rand)}`]);
  if (profile.indented) out.push((rand) => [`    ${words(rand)}`, `    # not a heading`]);
  if (profile.html) out.push((rand) => ['<pre>', `# ${words(rand)}`, '</pre>']);
  if (profile.wild) {
    out.push(
      (rand) => [wildInline(rand)],
      (rand) => [wildInline(rand), wildInline(rand)],
      (rand) => ['```js`x', `# ${words(rand)}`],
      (rand) => ['```', 'code', '```js', `# ${words(rand)}`, '```'],
      (rand) => ['- item', '', '      ```', `      # ${words(rand)}`, '      ```'],
      () => ['- item', '  ```', 'column zero', '  ```'],
      (rand) => ['> ```', `> ${words(rand)}`, '# after the quote'],
      (rand) => ['<!--', '```', '-->', `# ${words(rand)}`],
      (rand) => [`${words(rand)} <!-- ${words(rand)}`, '', `## inside -->`],
      () => ['- a', 'lazy continuation', '> quoted', '- b', '---'],
      () => ['1. one', '   - nested', '     - deeper', '  back'],
      (rand) => [`<!-- ${words(rand)} --> # not a heading`, '<!-- a --> - not an item'],
      (rand) => ['\t- tab item', `\t\t${words(rand)}`],
      (rand) => [`Use \`<!--\` to open. ${words(rand)}`, `## ${words(rand)}`],
      (rand) => [`${words(rand)} \``, `- ${words(rand)} \``],
      () => ['<details>', '', '## inside details', '', '</details>'],
      () => ['`', '``', '```'],
      (rand) => [`[${words(rand)}](`, `${path(rand)})`],
    );
  }
  return out;
}

/** A document of `count` fragments, separated by blank lines, perhaps not all of them. */
export function generate(rand: Rand, profile: Profile, count = 12): string {
  const pool = fragments(profile);
  const lines: string[] = [];
  if (profile.frontMatter && chance(rand, 0.3)) lines.push('---', `title: ${words(rand)}`, 'tags: [a, b]', '---');
  for (let i = 0; i < count; i += 1) {
    lines.push(...pick(rand, pool)(rand));
    if (!profile.wild || chance(rand, 0.8)) lines.push('');
  }
  if (profile.wild && chance(rand, 0.05)) lines.push('<!-- never closed', '# swallowed');
  return lines.join('\n');
}
