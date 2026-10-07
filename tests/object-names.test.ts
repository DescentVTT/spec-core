import { describe, expect, it } from 'vitest';

import {
  classifyRequest,
  createMcpServer,
  envelopeIssue,
  negotiateLegacyVersion,
  serveLines,
  unknownArguments,
  CLIENT_CAPABILITIES_KEY,
  CLIENT_INFO_KEY,
  INVALID_PARAMS,
  INVALID_REQUEST,
  LEGACY_PROTOCOL_VERSIONS,
  LEGACY_RESOURCE_NOT_FOUND,
  METHOD_NOT_FOUND,
  PROTOCOL_VERSION_KEY,
  type ByteSource,
  type JsonObject,
  type OutgoingMessage,
} from '../src/jsonrpc/index.js';
import {
  findEntry,
  keyName,
  readFrontMatter,
  removeEntry,
  scanMarkdown,
  sectionsOf,
  setEntry,
  slugify,
  titleOf,
  type FrontMatter,
  type ReadOptions,
} from '../src/markdown/index.js';
import { splitLines } from '../src/text/index.js';

/**
 * Names every JavaScript object answers to - `constructor`, `toString`,
 * `__proto__` - written where a document or a client writes a name: a
 * front-matter key, a heading, a link's label, a tool, a prompt, an argument.
 *
 * Each is a name like any other there: unknown where nothing defined it, and
 * found where something did. Nothing here was wrong when this was written.
 * Every table these names reach is a list, a map or a set, and a message is
 * read by constant keys. The tools that copy these modules had tables kept as
 * objects, which answered to `constructor` and `__proto__` where they held
 * neither, and four of the five tools were fixed for it. These tests hold the
 * modules they all read through, so that a table turned into an object here
 * fails a test before it reaches a tool.
 *
 * Each case reads the name beside a word nothing answers to, and expects the
 * two to be read alike.
 */

const NAMES: readonly string[] = ['constructor', 'toString', '__proto__'];

/** A word nothing answers to, and one that is written like `__proto__`. */
const PLAIN: readonly string[] = ['nonesuch', '__nonesuch__'];

const WORDS: readonly string[] = [...NAMES, 'valueOf', 'hasOwnProperty', ...PLAIN];

/** What every object answered to before a test ran: none may add to it. */
const INHERITED: readonly string[] = Object.getOwnPropertyNames(Object.prototype).sort();

function read(text: string, options: ReadOptions = {}): FrontMatter {
  const frontMatter = readFrontMatter(text, options);
  if (frontMatter === null) throw new Error('expected front matter');
  return frontMatter;
}

/* ------------------------------------------------------------ front matter */

describe('a front-matter key named as every object is', () => {
  it('is an entry like any other, under the key as written and the name it folds to', () => {
    const frontMatter = read('---\n__proto__: a\nconstructor: b\ntoString: c\nstatus: accepted\n---\n# T\n');
    expect(frontMatter.entries.map((entry) => [entry.key, entry.name, entry.line, entry.value])).toEqual([
      ['__proto__', 'proto', 1, { kind: 'scalar', scalar: { text: 'a', quoted: false } }],
      ['constructor', 'constructor', 2, { kind: 'scalar', scalar: { text: 'b', quoted: false } }],
      ['toString', 'tostring', 3, { kind: 'scalar', scalar: { text: 'c', quoted: false } }],
      ['status', 'status', 4, { kind: 'scalar', scalar: { text: 'accepted', quoted: false } }],
    ]);
    expect(frontMatter.problems).toEqual([]);
  });

  it('is not declared twice when it is written once, and is when it is written twice', () => {
    for (const key of WORDS) {
      expect(read(`---\n${key}: a\n---\n`).problems, key).toEqual([]);
      expect(read(`---\nstatus: accepted\n${key}: a\n${key}: b\n---\n`).problems, key).toEqual([
        { line: 3, message: `"${key}" is declared twice (first on line 3)` },
      ]);
    }
  });

  it('folds as any key does: its case and its underscores are not part of the name', () => {
    expect(NAMES.map(keyName)).toEqual(['constructor', 'tostring', 'proto']);
    // `__proto__` and `proto` are one key, as `depends_on` and `dependsOn` are.
    expect(read('---\n__proto__: a\nproto: b\n---\n').problems).toEqual([{ line: 2, message: '"proto" is declared twice (first on line 2)' }]);
    expect(read('---\ntoString: a\ntostring: b\n---\n').problems).toEqual([{ line: 2, message: '"tostring" is declared twice (first on line 2)' }]);
  });

  it('is found by findEntry where it was written', () => {
    const frontMatter = read('---\n__proto__: [a, b]\nconstructor: c\ntoString: "d"\n---\n');
    expect(findEntry(frontMatter, '__proto__')?.value).toEqual({
      kind: 'list',
      items: [
        { text: 'a', quoted: false },
        { text: 'b', quoted: false },
      ],
    });
    expect(findEntry(frontMatter, 'constructor')?.value).toEqual({ kind: 'scalar', scalar: { text: 'c', quoted: false } });
    expect(findEntry(frontMatter, 'toString')?.value).toEqual({ kind: 'scalar', scalar: { text: 'd', quoted: true } });
    // In any spelling of the key, as for every key.
    expect(findEntry(frontMatter, 'CONSTRUCTOR')?.key).toBe('constructor');
    expect(findEntry(frontMatter, 'to-string')?.key).toBe('toString');
  });

  it('is not found where no one wrote it, whatever the block or its absence answers to', () => {
    const written = read('---\nstatus: accepted\n---\n');
    for (const key of WORDS) {
      expect(findEntry(written, key), key).toBeUndefined();
      expect(findEntry(null, key), key).toBeUndefined();
      expect(findEntry(read('---\n---\n'), key), key).toBeUndefined();
    }
  });

  it('is read under a parent, and as a parent, when nesting is read', () => {
    const frontMatter = read('---\nconstructor:\n  __proto__: a\n  toString: b\n__proto__:\n  constructor: c\n---\n', { nested: true });
    expect(frontMatter.entries.map((entry) => [entry.key, entry.name, entry.parent])).toEqual([
      ['constructor.__proto__', 'constructor.proto', 'constructor'],
      ['constructor.toString', 'constructor.tostring', 'constructor'],
      ['__proto__.constructor', 'proto.constructor', '__proto__'],
    ]);
    expect(frontMatter.problems).toEqual([]);
    expect(findEntry(frontMatter, 'constructor.__proto__')?.value).toEqual({ kind: 'scalar', scalar: { text: 'a', quoted: false } });
    expect(findEntry(frontMatter, 'constructor')).toBeUndefined();
  });

  it('is a value like any other, plain, quoted and in a list', () => {
    for (const word of WORDS) {
      const frontMatter = read(`---\nstatus: ${word}\nquoted: "${word}"\nlist: [${word}, x]\nblock:\n  - ${word}\n---\n`);
      expect(frontMatter.problems, word).toEqual([]);
      expect(frontMatter.entries.map((entry) => entry.value), word).toEqual([
        { kind: 'scalar', scalar: { text: word, quoted: false } },
        { kind: 'scalar', scalar: { text: word, quoted: true } },
        {
          kind: 'list',
          items: [
            { text: word, quoted: false },
            { text: 'x', quoted: false },
          ],
        },
        { kind: 'list', items: [{ text: word, quoted: false }] },
      ]);
    }
  });

  it('is edited by setEntry where it stands, and every other line is left as it was', () => {
    for (const key of WORDS) {
      const text = `---\nstatus: accepted\n${key}: old\nowner: platform\n---\n# T\n`;
      const lines = splitLines(text);
      expect(setEntry(lines, read(text), key, 'new'), key).toEqual(['---', 'status: accepted', `${key}: new`, 'owner: platform', '---', '# T', '']);
      // Another key beside it is edited, and it is not.
      expect(setEntry(lines, read(text), 'status', 'draft'), key).toEqual(['---', 'status: draft', `${key}: old`, 'owner: platform', '---', '# T', '']);
    }
  });

  it('is added by setEntry where it is absent: last in a block, or in a new block', () => {
    for (const key of WORDS) {
      const text = '---\nstatus: accepted\n---\n# T\n';
      expect(setEntry(splitLines(text), read(text), key, 'x'), key).toEqual(['---', 'status: accepted', `${key}: x`, '---', '# T', '']);
      expect(setEntry(['# T', ''], null, key, 'x'), key).toEqual(['---', `${key}: x`, '---', '# T', '']);
    }
  });

  it('is removed by removeEntry where it stands, and nothing is removed where it is absent', () => {
    for (const key of WORDS) {
      const text = `---\nstatus: accepted\n${key}:\n  - a\n  - b\nowner: platform\n---\n`;
      expect(removeEntry(splitLines(text), read(text), key), key).toEqual(['---', 'status: accepted', 'owner: platform', '---', '']);
      const without = '---\nstatus: accepted\n---\n';
      expect(removeEntry(splitLines(without), read(without), key), key).toEqual(['---', 'status: accepted', '---', '']);
    }
  });

  it('reaches no prototype: what is read is plain data, and no object gains a member', () => {
    const frontMatter = read('---\n__proto__: [polluted, yes]\nconstructor:\n  __proto__: polluted\n  prototype: polluted\n---\n', { nested: true });
    expect(Object.getPrototypeOf(frontMatter)).toBe(Object.prototype);
    for (const entry of frontMatter.entries) {
      expect(Object.getPrototypeOf(entry), entry.key).toBe(Object.prototype);
      expect(Object.getPrototypeOf(entry.value), entry.key).toBe(Object.prototype);
    }
    const lines = setEntry(['---', '---'], read('---\n---\n'), '__proto__', 'polluted');
    expect(lines).toEqual(['---', '__proto__: polluted', '---']);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(INHERITED);
    const fresh: Record<string, unknown> = {};
    expect([fresh['polluted'], fresh['0'], fresh['kind'], fresh['text']]).toEqual([undefined, undefined, undefined, undefined]);
    expect(Object.getOwnPropertyNames(Array.prototype)).not.toContain('polluted');
  });
});

/* ---------------------------------------------------------------- headings */

describe('a heading named as every object is', () => {
  it('slugs as its text does, and the first of its name has the bare anchor', () => {
    expect(NAMES.map(slugify)).toEqual(['constructor', 'tostring', 'proto']);
    for (const name of WORDS) {
      const { headings } = scanMarkdown(`# ${name}\n\ntext\n`);
      expect(headings.map((heading) => [heading.text, heading.slug, heading.anchor]), name).toEqual([[name, slugify(name), slugify(name)]]);
    }
  });

  it('counts from the second of its name, as any repeated heading does', () => {
    for (const name of WORDS) {
      const slug = slugify(name);
      const { headings } = scanMarkdown(`# ${name}\n\n## ${name}\n\n## Other\n\n### ${name}\n\n## Other\n`);
      expect(headings.map((heading) => heading.anchor), name).toEqual([slug, `${slug}-1`, 'other', `${slug}-2`, 'other-1']);
    }
  });

  it('keeps the names apart: one counts for none of the others', () => {
    const { headings } = scanMarkdown('# constructor\n\n## toString\n\n## __proto__\n\n## valueOf\n\n## constructor\n\n## proto\n');
    expect(headings.map((heading) => heading.anchor)).toEqual(['constructor', 'tostring', 'proto', 'valueof', 'constructor-1', 'proto-1']);
  });

  it('is a title and a section like any other', () => {
    for (const name of WORDS) {
      const scan = scanMarkdown(`# ${name}\n\nintro\n\n## ${name}\n\nbody\n`);
      expect(titleOf(scan)?.text, name).toBe(name);
      expect(sectionsOf(scan).map((section) => [section.heading.text, section.heading.level]), name).toEqual([
        [name, 1],
        [name, 2],
      ]);
    }
  });
});

/* ------------------------------------------------------------------- links */

describe('a link label named as every object is', () => {
  const uses = (text: string): [string, string | null, string][] =>
    scanMarkdown(text)
      .links.filter((link) => link.form !== 'definition')
      .map((link) => [link.form, link.label, link.target]);

  it('is no link where nothing defines it, in each of the three reference forms', () => {
    for (const name of WORDS) {
      expect(uses(`See [text][${name}] and [${name}][] and [${name}].\n`), name).toEqual([]);
    }
  });

  it('is a link to its definition where one is written, in any case', () => {
    for (const name of WORDS) {
      const text = `See [text][${name}] and [${name}][] and [${name.toUpperCase()}].\n\n[${name}]: https://example.com/${name}\n`;
      const target = `https://example.com/${name}`;
      expect(uses(text), name).toEqual([
        ['reference', name, target],
        ['reference', name, target],
        ['shortcut', name.toUpperCase(), target],
      ]);
    }
  });

  it('takes the first of two definitions, as any label does, and a definition once written is taken', () => {
    for (const name of WORDS) {
      expect(uses(`[${name}]\n\n[${name}]: /first\n[${name}]: /second\n`), name).toEqual([['shortcut', name, '/first']]);
      expect(uses(`[${name}]\n\n[${name}]: /only\n`), name).toEqual([['shortcut', name, '/only']]);
    }
  });

  it('defines nothing for the other names', () => {
    expect(uses('[constructor] [toString] [__proto__] [valueOf]\n\n[constructor]: /c\n')).toEqual([['shortcut', 'constructor', '/c']]);
  });

  it('is a destination, an anchor and a wiki target as written', () => {
    for (const name of WORDS) {
      const { links } = scanMarkdown(`[a](${name}.md#${name}) [[${name}]] [[${name}#${name}|text]] <https://example.com/${name}>\n`);
      expect(links.map((link) => [link.form, link.target]), name).toEqual([
        ['inline', `${name}.md#${name}`],
        ['wiki', name],
        ['wiki', `${name}#${name}`],
        ['autolink', `https://example.com/${name}`],
      ]);
    }
  });
});

/* --------------------------------------------------------------------- mcp */

/** What a tool was last called with, so a test can see what reached it. */
interface Calls {
  readonly echo: JsonObject[];
  readonly draft: Readonly<Record<string, string>>[];
}

function served(calls: Calls = { echo: [], draft: [] }): (message: unknown) => Promise<OutgoingMessage | null> {
  return createMcpServer({
    name: 'demo',
    version: '1.2.3',
    instructions: 'Use it.',
    tools: [
      {
        descriptor: { name: 'echo', inputSchema: { type: 'object' } },
        call: async (args) => {
          calls.echo.push(args);
          return unknownArguments(args, ['text']) ?? { text: String(args['text']) };
        },
      },
      // Reads its argument and checks nothing, as a careless tool would.
      { descriptor: { name: 'trusting' }, call: async (args) => ({ text: `text is ${String(args['text'])}` }) },
    ],
    resources: { list: async () => [], read: async (uri) => (uri === 'demo://a' ? [{ uri, text: 'A' }] : null) },
    prompts: [
      {
        descriptor: { name: 'draft', arguments: [{ name: 'goal', required: true }] },
        get: async (args) => {
          calls.draft.push(args);
          return { messages: [{ role: 'user', content: { type: 'text', text: `Draft: ${String(args['goal'])}` } }] };
        },
      },
    ],
  });
}

/** A message as a client sends it: text, parsed, so that `__proto__` is a key of it and not what it inherits from. */
const sent = (text: string): unknown => JSON.parse(text);
const request = (method: string, params: string, id = '1'): unknown => sent(`{"jsonrpc":"2.0","id":${id},"method":${JSON.stringify(method)},"params":${params}}`);

describe('a method, a tool, a prompt or a resource named as every object is', () => {
  it('is no method, alone or under a family the server serves', async () => {
    for (const name of WORDS) {
      for (const method of [name, `tools/${name}`, `prompts/${name}`, `resources/${name}`, `${name}/list`, `${name}/call`]) {
        expect(await served()(request(method, '{}')), method).toEqual({ jsonrpc: '2.0', id: 1, error: { code: METHOD_NOT_FOUND, message: 'Method not found' } });
      }
    }
  });

  it('is an unknown tool, and no tool is called', async () => {
    for (const name of WORDS) {
      const calls: Calls = { echo: [], draft: [] };
      expect(await served(calls)(request('tools/call', `{"name":${JSON.stringify(name)},"arguments":{"text":"a"}}`)), name).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: { code: INVALID_PARAMS, message: `Unknown tool: ${name}` },
      });
      expect(calls.echo, name).toEqual([]);
    }
  });

  it('is an unknown prompt, and no prompt is expanded', async () => {
    for (const name of WORDS) {
      const calls: Calls = { echo: [], draft: [] };
      expect(await served(calls)(request('prompts/get', `{"name":${JSON.stringify(name)},"arguments":{"goal":"x"}}`)), name).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: { code: INVALID_PARAMS, message: `Unknown prompt: ${name}` },
      });
      expect(calls.draft, name).toEqual([]);
    }
  });

  it('is a resource the provider is asked for by that name, and not found when it has none', async () => {
    for (const name of WORDS) {
      expect(await served()(request('resources/read', `{"uri":${JSON.stringify(name)}}`)), name).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: { code: LEGACY_RESOURCE_NOT_FOUND, message: 'Resource not found', data: { uri: name } },
      });
    }
  });

  it('is found when a server defines one of that name, as any name is', async () => {
    for (const name of WORDS) {
      const handle = createMcpServer({
        name: 'demo',
        version: '1',
        instructions: '',
        tools: [{ descriptor: { name }, call: async () => ({ text: `called ${name}` }) }],
        prompts: [{ descriptor: { name }, get: async () => ({ messages: [] }) }],
      });
      expect(await handle(request('tools/call', `{"name":${JSON.stringify(name)}}`)), name).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: `called ${name}` }] },
      });
      expect(await handle(request('prompts/get', `{"name":${JSON.stringify(name)}}`)), name).toEqual({ jsonrpc: '2.0', id: 1, result: { messages: [] } });
      expect(await handle(request('tools/list', '{}')), name).toEqual({ jsonrpc: '2.0', id: 1, result: { tools: [{ name }] } });
    }
  });
});

describe('an argument named as every object is', () => {
  it('is reported to the model by name, alone and beside the argument the tool takes', async () => {
    for (const name of WORDS) {
      for (const args of [`{${JSON.stringify(name)}:1}`, `{"text":"a",${JSON.stringify(name)}:1}`]) {
        expect(await served()(request('tools/call', `{"name":"echo","arguments":${args}}`)), `${name} in ${args}`).toEqual({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: `Unknown argument "${name}"; this tool takes text.` }], isError: true },
        });
      }
    }
  });

  it('is listed with the others, in the order they were sent', () => {
    expect(unknownArguments(sent('{"constructor":1,"text":"a","__proto__":2,"toString":3}') as JsonObject, ['text'])).toEqual({
      text: 'Unknown arguments "constructor", "__proto__", "toString"; this tool takes text.',
      isError: true,
    });
    expect(unknownArguments(sent('{"text":"a"}') as JsonObject, ['text'])).toBeUndefined();
    expect(unknownArguments(sent('{}') as JsonObject, [])).toBeUndefined();
  });

  it('is allowed when the tool takes an argument of that name', () => {
    for (const name of WORDS) {
      expect(unknownArguments(sent(`{${JSON.stringify(name)}:1}`) as JsonObject, [name]), name).toBeUndefined();
    }
  });

  it('carries nothing in under __proto__: a tool that reads an argument finds none', async () => {
    const calls: Calls = { echo: [], draft: [] };
    const handle = served(calls);
    const smuggled = '{"__proto__":{"text":"smuggled"}}';
    // A tool that checks is told of the argument; one that does not reads nothing.
    expect(await handle(request('tools/call', `{"name":"echo","arguments":${smuggled}}`))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: 'Unknown argument "__proto__"; this tool takes text.' }], isError: true },
    });
    expect(await handle(request('tools/call', `{"name":"trusting","arguments":${smuggled}}`))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: 'text is undefined' }] },
    });
    const [received] = calls.echo;
    expect(Object.keys(received as JsonObject)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(received)).toBe(Object.prototype);
    expect((received as JsonObject)['text']).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(INHERITED);
  });

  it('reaches a prompt as a string of that name, and only as a string', async () => {
    const calls: Calls = { echo: [], draft: [] };
    const handle = served(calls);
    expect(await handle(request('prompts/get', '{"name":"draft","arguments":{"__proto__":"x","constructor":"y"}}'))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { messages: [{ role: 'user', content: { type: 'text', text: 'Draft: undefined' } }] },
    });
    expect(calls.draft.map((args) => Object.entries(args))).toEqual([
      [
        ['__proto__', 'x'],
        ['constructor', 'y'],
      ],
    ]);
    // An object under it is no string, so the request is refused before the prompt is asked.
    expect(await handle(request('prompts/get', '{"name":"draft","arguments":{"__proto__":{"goal":"smuggled"}}}'))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: INVALID_PARAMS, message: 'Prompt arguments must be an object of strings.' },
    });
    expect(calls.draft).toHaveLength(1);
  });
});

describe('a key of a message named as every object is', () => {
  const envelope = `{"${PROTOCOL_VERSION_KEY}":"2026-07-28","${CLIENT_CAPABILITIES_KEY}":{},"${CLIENT_INFO_KEY}":{"name":"t","version":"1"}}`;

  it('claims no protocol version: an envelope under it is not the envelope', () => {
    for (const name of WORDS) {
      const params = sent(`{"_meta":{${JSON.stringify(name)}:${envelope}}}`) as JsonObject;
      expect(classifyRequest('tools/list', params), name).toBe('legacy');
      expect(envelopeIssue(params['_meta'] as JsonObject), name).toBe(`${CLIENT_CAPABILITIES_KEY}: missing`);
    }
    expect(classifyRequest('tools/list', sent(`{"_meta":${envelope}}`) as JsonObject)).toBe('modern');
  });

  it('is no request: a request under it is not answered as one', async () => {
    for (const name of WORDS) {
      expect(await served()(sent(`{${JSON.stringify(name)}:{"jsonrpc":"2.0","id":1,"method":"ping"}}`)), name).toEqual({
        jsonrpc: '2.0',
        error: { code: INVALID_REQUEST, message: 'Invalid Request' },
      });
      // Beside a real request it changes nothing.
      expect(await served()(sent(`{"jsonrpc":"2.0","id":1,"method":"ping",${JSON.stringify(name)}:{"method":"tools/list"}}`)), name).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: {},
      });
    }
  });

  it('is no parameter either: a cursor or a name under it is not read', async () => {
    for (const name of WORDS) {
      expect(await served()(request('tools/list', `{${JSON.stringify(name)}:{"cursor":"x"}}`)), name).toMatchObject({ id: 1, result: { tools: [{ name: 'echo' }, { name: 'trusting' }] } });
      expect(await served()(request('tools/call', `{${JSON.stringify(name)}:{"name":"echo"}}`)), name).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: { code: INVALID_PARAMS, message: 'tools/call needs the name of a tool.' },
      });
    }
  });

  it('is a version no revision has, so the newest legacy one is offered', () => {
    for (const name of WORDS) expect(negotiateLegacyVersion(name), name).toBe(LEGACY_PROTOCOL_VERSIONS[0]);
  });
});

describe('a request id named as every object is', () => {
  /** A byte source a test drives by hand. */
  function source(): ByteSource & { push(text: string): void; end(): void } {
    const data: ((chunk: Uint8Array) => void)[] = [];
    const end: (() => void)[] = [];
    const encoder = new TextEncoder();
    return {
      on: (_event: 'data', listener: (chunk: Uint8Array) => void) => data.push(listener),
      once: ((event: 'end' | 'error', listener: never) => (event === 'end' ? end.push(listener) : 0)) as ByteSource['once'],
      push: (text) => {
        for (const listener of data) listener(encoder.encode(text));
      },
      end: () => {
        for (const listener of end) listener();
      },
    };
  }

  it('is answered under that id, and a cancellation of it before it is asked cancels nothing', async () => {
    for (const name of WORDS) {
      const id = JSON.stringify(name);
      const input = source();
      const written: string[] = [];
      const done = serveLines(input, (line) => written.push(line), served());
      input.push(`{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":${id}}}\n`);
      input.push(`{"jsonrpc":"2.0","id":${id},"method":"ping"}\n`);
      input.end();
      await done;
      expect(written.map((line) => JSON.parse(line) as unknown), name).toEqual([{ jsonrpc: '2.0', id: name, result: {} }]);
    }
  });

  it('is cancelled by its own id alone, while it runs', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = createMcpServer({
      name: 'slow',
      version: '0',
      instructions: '',
      tools: [{ descriptor: { name: 'wait' }, call: async () => (await gate, { text: 'done' }) }],
    });
    const input = source();
    const written: string[] = [];
    const done = serveLines(input, (line) => written.push(line), slow);
    for (const name of NAMES) input.push(`{"jsonrpc":"2.0","id":${JSON.stringify(name)},"method":"tools/call","params":{"name":"wait"}}\n`);
    input.push('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":"constructor"}}\n');
    input.end();
    release();
    await done;
    expect(written.map((line) => (JSON.parse(line) as { id: unknown }).id).sort()).toEqual(['__proto__', 'toString']);
  });
});
