/**
 * What this repository asks of npm, held to what npm 10, 11 and 12 all do.
 *
 * CI installs with the npm each Node carries, 10 with Node 22 and 11 with
 * Node 24 and 26, and a contributor may have 12, the registry's `latest` on
 * 2026-10-07. npm 12 changed three things a workflow can lean on without
 * noticing: a dependency's install script runs only when
 * `allowScripts` in package.json names the package, `--json` prints another
 * shape for `npm pack`, `npm publish` and `npm view`, and a flag npm does not
 * define, or an abbreviation of one, is an error where it was a warning. Each
 * test holds the workflow to the reading all three share, as the tools that
 * copy this library hold theirs.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8');

interface Command {
  readonly where: string;
  /** From `npm` to where the shell ends the command. */
  readonly text: string;
}

/**
 * The npm commands in `text`, comment lines apart. A command ends at a pipe,
 * a redirection, `&&`, `;` or a parenthesis. `npx` is not npm here: what
 * follows the command it runs belongs to that command.
 */
function npmCommands(text: string, file: string): Command[] {
  return text.split(/\r?\n/).flatMap((line, index) =>
    /^\s*#/.test(line)
      ? []
      : [...line.matchAll(/(?<![\w@/.-])npm(?= )[^|;&<>()]*/g)].map((match) => ({ where: `${file}:${index + 1}`, text: match[0].trim() })),
  );
}

/** The flags npm reads from a command: each `-x` and `--x` before a bare `--`, without its value. */
function flagsOf(command: string): string[] {
  const words = command.split(/\s+/);
  const end = words.indexOf('--');
  return (end === -1 ? words : words.slice(0, end)).filter((word) => /^--?[a-z]/.test(word)).map((word) => word.split('=')[0] as string);
}

/**
 * The flags the family's workflows and scripts pass to npm, each one a config
 * that npm 10.9.9, 11.20.0 and 12.2.0 define under this spelling, read from
 * the definitions each of them ships on 2026-10-07. A flag joins the list when
 * all three are seen to define it; `--json` is defined and stays out, because
 * what it prints is not the same under the three.
 */
const DEFINED: readonly string[] = ['--access', '--dry-run', '--ignore-scripts', '--no-save', '--pack-destination', '--provenance', '--tag', '--version', '-g'];

const workflows = readdirSync(`${ROOT}.github/workflows`)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort();
const commands = [
  ...workflows.flatMap((name) => npmCommands(read(`.github/workflows/${name}`), name)),
  ...Object.entries((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts).flatMap(([name, script]) =>
    npmCommands(script, `package.json "${name}"`),
  ),
];
const shown = (found: readonly Command[]): string[] => found.map(({ where, text }) => `${where}: ${text}`);

describe('the workflow and the scripts, under any npm from 10 to 12', () => {
  it('are read, down to the commands every job runs', () => {
    // A workflow that moved, or a line this file no longer reads, would leave
    // the checks below nothing to fail on.
    expect(workflows).toContain('ci.yml');
    const texts = commands.map(({ text }) => text);
    expect(texts).toContain('npm ci --ignore-scripts');
    expect(texts).toContain('npm run lint');
    expect(texts).toContain('npm test');
  });

  it("install without any dependency's install script, which npm 12 refuses and npm 10 and 11 run unless told", () => {
    const installs = commands.filter(({ text }) => /^npm ci\b/.test(text));
    expect(installs.length).toBeGreaterThanOrEqual(4);
    expect(shown(installs.filter(({ text }) => !flagsOf(text).includes('--ignore-scripts')))).toEqual([]);
  });

  it('pass npm only flags that all three define, spelled in full: npm 12 refuses any other, and an abbreviation', () => {
    const refused = commands.filter(({ text }) => flagsOf(text).some((flag) => !DEFINED.includes(flag)));
    expect(shown(refused)).toEqual([]);
  });

  it('read no --json and no `npm pkg`, whose output npm 12 changed', () => {
    expect(shown(commands.filter(({ text }) => flagsOf(text).includes('--json') || /^npm pkg\b/.test(text)))).toEqual([]);
  });
});

describe('a contributor, with any npm from 10 to 12', () => {
  it('starts from `npm ci`, which leaves the lockfile as it is where `npm install` under npm 10 rewrites it', () => {
    // npm 10 writes the lockfile back without the `libc` fields npm 11 and 12
    // keep, so the first command a contributor is given must not be the one
    // that leaves a changed lockfile behind on Node 22.
    const first = /```bash\n([\s\S]*?)```/.exec(read('CONTRIBUTING.md'))?.[1] ?? '';
    const commands = first.split('\n').map((line) => line.split('#')[0]?.trim());
    expect(commands).toContain('npm ci');
    expect(commands).not.toContain('npm install');
  });
});

/**
 * `npx <name>` runs the project's install of a command, and where there is
 * none it fetches the registry's package of that name and runs it, unasked
 * when no terminal is attached. Here that is a worktree before `npm ci`, and
 * the names are other people's: `tsc` on the registry is not the `typescript`
 * package, and `vitest` there is a major this repository holds back. So
 * `.npmrc` has npm fetch nothing for a command, and each line that runs a
 * tool through npx says `--no-install` as well: the reason is then on the
 * line, and the flag holds where the environment says `npm_config_yes=true`,
 * which outranks the file. Under npm 10.9.9, 11.20.0 and 12.2.0, with either
 * one npm stops and names the package it did not fetch. Neither stops a
 * package an earlier npx left in npm's cache, and `--yes` on a command undoes
 * the file.
 */

/** What starts a command by the name it is given: npx, and npm's own spellings of it. */
const RUNNER = /(?<![\w@/.-])(?:npx|npm\s+(?:exec|x))(?![\w-])/g;

interface Run {
  readonly where: string;
  readonly written: string;
  /** What the runner itself is told: the flags in front of the command. */
  readonly flags: readonly string[];
  readonly command: string;
}

/**
 * Each place `text` starts a command through a runner, comment lines apart,
 * since a comment runs nothing. The words are taken as a shell, a string or
 * an array of strings separates them, up to where the shell ends the command.
 */
function runsOf(text: string, file: string): Run[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (/^\s*(?:#|\/\/|\/?\*)/.test(line)) return [];
    return [...line.matchAll(RUNNER)].map((match) => {
      const tail = line.slice(match.index + match[0].length).split(/[|;&<>()]/)[0] as string;
      const words = tail
        .replace(/["'`,[\]{}]/g, ' ')
        .split(/\s+/)
        .filter((word) => word !== '' && word !== '--');
      const first = words.findIndex((word) => !word.startsWith('-'));
      const flags = (first === -1 ? words : words.slice(0, first)).map((word) => word.split('=')[0] as string);
      return { where: `${file}:${index + 1}`, written: line.trim(), flags, command: words[first] ?? '' };
    });
  });
}

/**
 * What is wrong with a run, if anything. `--no-install` and `--no` have npm
 * stop where the command is not installed. A package under the family's scope
 * is the family's whoever fetches it; any other name is whoever registered it.
 */
function faultOf({ flags, command }: Run): string | null {
  if (flags.includes('--yes') || flags.includes('-y')) return 'is told to fetch';
  if (flags.includes('--no-install') || flags.includes('--no')) return null;
  return command.startsWith('@descent-vtt/') ? null : 'fetches where the command is not installed';
}

/** What runs a command here: the workflows, the scripts of package.json, the files under scripts/ and the configuration files beside them. */
const sources: ReadonlyArray<readonly [file: string, text: string]> = [
  ...workflows.map((name) => [name, read(`.github/workflows/${name}`)] as const),
  ...Object.entries((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts).map(([name, script]) => [`package.json "${name}"`, script] as const),
  ...readdirSync(`${ROOT}scripts`, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `scripts/${entry.name}`)
    .sort()
    .map((file) => [file, read(file)] as const),
  ...readdirSync(ROOT)
    .filter((name) => /\.config\.[cm]?[jt]s$/.test(name))
    .sort()
    .map((name) => [name, read(name)] as const),
];

describe('a tool run through npx, in a tree that may not have it installed', () => {
  const runs = sources.flatMap(([file, text]) => runsOf(text, file));
  const faults = (text: string): Array<string | null> => runsOf(text, 'x').map(faultOf);

  it.each([
    ['          npx stryker run stryker.shard.config.mjs --concurrency 4'],
    ["run('npx', ['tsc', '-p', 'tsconfig.build.json', '--outDir', path.join(WORK, 'base')], { shell: true });"],
    ["execSync(`npx vitest run ${SUITE}`, { stdio: 'pipe' });"],
    ['"docs": "npx typedoc && node scripts/x.mjs"'],
    ['npm exec -- tsc --noEmit'],
    // A flag after the command is the command's own.
    ['npx stryker run --no-install'],
    // Another scope is another publisher.
    ['npx @example/spec-guard'],
  ])('is one npm would fetch for, as %j runs it', (text) => {
    expect(faults(text)).toEqual(['fetches where the command is not installed']);
  });

  it.each([
    ['npx --yes cowsay'],
    ['npx -y cowsay@1.6.0'],
    ['npm exec --yes -- cowsay'],
    // Told both: `--yes` is the one that decides nothing good.
    ['npx --no-install --yes cowsay'],
    ['npx --yes @descent-vtt/spec-guard'],
  ])('is one npm is told to fetch for, as %j runs it', (text) => {
    expect(faults(text)).toEqual(['is told to fetch']);
  });

  it.each([
    ['          npx --no-install stryker run stryker.shard.config.mjs --concurrency 4'],
    ["run('npx', ['--no-install', 'tsc', '-p', 'tsconfig.build.json'], { shell: true });"],
    ["execSync(`npx --no-install vitest run ${SUITE}`, { stdio: 'pipe' });"],
    ['started=$SECONDS; npx --no-install stryker run; echo done'],
    ['npx --no tsc --noEmit'],
    ['npm exec --no -- tsc --noEmit'],
    // The command's own `--yes`, which npx hands on unread.
    ['npx --no-install stryker run --yes'],
    ['npx @descent-vtt/spec-guard --format github'],
    ['npx --no-install @descent-vtt/spec-guard@0.19.0'],
  ])('is in order as %j runs it', (text) => {
    expect(faults(text)).toEqual([null]);
  });

  it.each([
    ['      # npx alone would fetch whatever the registry has under the name'],
    ['// npx is a shim Windows cannot start without a shell'],
    [' * npx, where nothing is installed, fetches'],
    ['npm run lint'],
    ['npm ci --ignore-scripts'],
    ['node node_modules/typescript/bin/tsc -p tsconfig.json'],
    ['"build": "tsc -p tsconfig.build.json"'],
  ])('is not what %j is: a comment runs nothing, and a script or a path fetches nothing', (text) => {
    expect(faults(text)).toEqual([]);
  });

  it('is looked for where this repository runs one: the workflow, the scripts and the configuration files', () => {
    // A directory that moved, or a line this file no longer reads, would leave
    // the checks below nothing to fail on.
    expect(sources.map(([name]) => name)).toEqual(expect.arrayContaining(['ci.yml', 'package.json "test:mutation"', 'scripts/mutation-shards.mjs', 'stryker.shard.config.mjs']));
    const found = runs.map(({ where, flags, command }) => [where.split(':')[0], ...flags, command].join(' '));
    expect(found).toEqual(expect.arrayContaining(['ci.yml --no-install stryker']));
  });

  it('is one npm stops at, where the command is not installed: `.npmrc` says `yes=false` for every command here', () => {
    // The last line that sets a key is the one npm takes.
    const settings = new Map(
      read('.npmrc')
        .split(/\r?\n/)
        .filter((line) => !/^\s*(?:[#;]|$)/.test(line))
        .map((line) => {
          const [key, ...value] = line.split('=');
          return [(key as string).trim(), value.join('=').trim()] as const;
        }),
    );
    expect(settings.get('yes')).toBe('false');
  });

  it("says so on its line as well: `--no-install`, or the full name of one of the family's packages", () => {
    expect(runs.filter((run) => faultOf(run) !== null).map((run) => `${run.where}: ${run.written} (${faultOf(run)})`)).toEqual([]);
  });

  it('is never told to fetch: npm is given no `--yes`, and nothing sets `npm_config_yes` to anything but false', () => {
    expect(shown(commands.filter(({ text }) => flagsOf(text).some((flag) => flag === '--yes' || flag === '-y')))).toEqual([]);
    const set = /npm_config_yes["']?\s*[:=]\s*["']?(?!false\b)/i;
    expect(sources.flatMap(([file, text]) => text.split(/\r?\n/).flatMap((line, index) => (set.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])))).toEqual([]);
  });
});
