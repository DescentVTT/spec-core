import { describe, expect, it } from 'vitest';

import {
  classifyRequest,
  createMcpServer,
  envelopeIssue,
  negotiateLegacyVersion,
  serveLines,
  toolError,
  unknownArguments,
  CLIENT_CAPABILITIES_KEY,
  CLIENT_INFO_KEY,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  LEGACY_PROTOCOL_VERSIONS,
  LEGACY_RESOURCE_NOT_FOUND,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  PROTOCOL_VERSION_KEY,
  SERVER_INFO_KEY,
  UNSUPPORTED_PROTOCOL_VERSION,
  type ByteSource,
  type JsonObject,
  type McpServerDefinition,
  type OutgoingMessage,
} from '../src/jsonrpc/index.js';

const MODERN_META = {
  [PROTOCOL_VERSION_KEY]: '2026-07-28',
  [CLIENT_CAPABILITIES_KEY]: {},
  [CLIENT_INFO_KEY]: { name: 'test', version: '1' },
};

function server(overrides: Partial<McpServerDefinition> = {}): (message: unknown) => Promise<OutgoingMessage | null> {
  return createMcpServer({
    name: 'demo',
    version: '1.2.3',
    instructions: 'Use it.',
    tools: [
      {
        descriptor: { name: 'echo', description: 'Echoes', inputSchema: { type: 'object' } },
        call: async (args) => {
          const unknown = unknownArguments(args, ['text']);
          if (unknown) return unknown;
          return { text: String(args['text']), structured: { echoed: args['text'] } };
        },
      },
      { descriptor: { name: 'boom' }, call: async () => Promise.reject(new Error('it broke')) },
      { descriptor: { name: 'refuse' }, call: async () => toolError('no') },
      { descriptor: { name: 'odd' }, call: async () => Promise.reject('a string') },
    ],
    resources: {
      list: async () => [{ uri: 'demo://a', name: 'a' }],
      templates: [{ uriTemplate: 'demo://{x}', name: 'x' }],
      read: async (uri) => (uri === 'demo://a' ? [{ uri, text: 'A' }] : null),
    },
    prompts: [
      {
        descriptor: { name: 'draft', arguments: [{ name: 'goal', required: true }] },
        get: async (args) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Draft: ${args['goal']}` } }] }),
      },
    ],
    ...overrides,
  });
}

async function call(method: string, params?: JsonObject, id: string | number = 1): Promise<OutgoingMessage | null> {
  return server()({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
}

function result(message: OutgoingMessage | null): JsonObject {
  if (message === null || !('result' in message)) throw new Error(`expected a result, got ${JSON.stringify(message)}`);
  return message.result;
}

function failure(message: OutgoingMessage | null): { code: number; message: string; data?: unknown } {
  if (message === null || !('error' in message)) throw new Error(`expected an error, got ${JSON.stringify(message)}`);
  return message.error;
}

describe('the legacy era', () => {
  it('negotiates the version asked for, or the newest it knows', async () => {
    expect(result(await call('initialize', { protocolVersion: '2025-06-18' }))).toEqual({
      protocolVersion: '2025-06-18',
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: { name: 'demo', version: '1.2.3' },
      instructions: 'Use it.',
    });
    expect(result(await call('initialize', { protocolVersion: '1999-01-01' }))['protocolVersion']).toBe(LEGACY_PROTOCOL_VERSIONS[0]);
    expect(negotiateLegacyVersion(42)).toBe(LEGACY_PROTOCOL_VERSIONS[0]);
  });

  it('declares only the capabilities it has', async () => {
    const bare = createMcpServer({ name: 'n', version: '0', instructions: '' });
    const reply = await bare({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(result(reply)['capabilities']).toEqual({});
    // A capability it did not declare answers as any unknown method does.
    for (const method of ['tools/list', 'tools/call', 'resources/list', 'resources/templates/list', 'resources/read', 'prompts/list', 'prompts/get']) {
      expect(failure(await bare({ jsonrpc: '2.0', id: 2, method, params: { name: 'x', uri: 'x' } }))).toEqual({ code: METHOD_NOT_FOUND, message: 'Method not found' });
    }
    // A method that merely starts like one is still unknown.
    expect(failure(await bare({ jsonrpc: '2.0', id: 3, method: 'toolsy' })).code).toBe(METHOD_NOT_FOUND);
  });

  it('answers ping, and refuses server/discover, which is modern only', async () => {
    expect(result(await call('ping'))).toEqual({});
    expect(failure(await call('server/discover')).code).toBe(METHOD_NOT_FOUND);
  });
});

describe('tools, resources and prompts', () => {
  it('lists and calls tools, with the outcome as text and as data', async () => {
    expect((result(await call('tools/list'))['tools'] as JsonObject[]).map((t) => t['name'])).toEqual(['echo', 'boom', 'refuse', 'odd']);
    expect(result(await call('tools/call', { name: 'echo', arguments: { text: 'hi' } }))).toEqual({
      content: [{ type: 'text', text: 'hi' }],
      structuredContent: { echoed: 'hi' },
    });
  });

  it('reports a failing tool to the model, not as a protocol error', async () => {
    expect(result(await call('tools/call', { name: 'boom' }))).toEqual({
      content: [{ type: 'text', text: 'demo failed: it broke' }],
      isError: true,
    });
    expect(result(await call('tools/call', { name: 'odd' }))['content']).toEqual([{ type: 'text', text: 'demo failed: a string' }]);
    expect(result(await call('tools/call', { name: 'refuse' }))).toEqual({ content: [{ type: 'text', text: 'no' }], isError: true });
    expect(result(await call('tools/call', { name: 'echo', arguments: { text: 'a', loud: true, x: 1 } }))['content']).toEqual([
      { type: 'text', text: 'Unknown arguments "loud", "x"; this tool takes text.' },
    ]);
  });

  it('refuses a call it cannot route', async () => {
    expect(failure(await call('tools/call', {}))).toEqual({ code: INVALID_PARAMS, message: 'tools/call needs the name of a tool.' });
    expect(failure(await call('tools/call', { name: 'nope' }))).toEqual({ code: INVALID_PARAMS, message: 'Unknown tool: nope' });
    expect(failure(await call('tools/call', { name: 'echo', arguments: [] }))).toEqual({
      code: INVALID_PARAMS,
      message: 'Tool arguments must be an object.',
    });
  });

  it('serves resources, and says when one does not exist in the era\'s own words', async () => {
    expect(result(await call('resources/list'))).toEqual({ resources: [{ uri: 'demo://a', name: 'a' }] });
    expect(result(await call('resources/templates/list'))).toEqual({ resourceTemplates: [{ uriTemplate: 'demo://{x}', name: 'x' }] });
    expect(result(await call('resources/read', { uri: 'demo://a' }))).toEqual({ contents: [{ uri: 'demo://a', text: 'A' }] });
    expect(failure(await call('resources/read', { uri: 'demo://b' }))).toEqual({
      code: LEGACY_RESOURCE_NOT_FOUND,
      message: 'Resource not found',
      data: { uri: 'demo://b' },
    });
    expect(failure(await call('resources/read', { uri: 'demo://b', _meta: MODERN_META })).code).toBe(INVALID_PARAMS);
    expect(failure(await call('resources/read', {})).message).toBe('resources/read needs a uri.');
  });

  it('expands prompts from string arguments only', async () => {
    expect(result(await call('prompts/list'))).toEqual({ prompts: [{ name: 'draft', arguments: [{ name: 'goal', required: true }] }] });
    expect(result(await call('prompts/get', { name: 'draft', arguments: { goal: 'x' } }))).toEqual({
      messages: [{ role: 'user', content: { type: 'text', text: 'Draft: x' } }],
    });
    expect(failure(await call('prompts/get', { name: 'draft', arguments: { goal: 3 } })).message).toBe(
      'Prompt arguments must be an object of strings.',
    );
    expect(failure(await call('prompts/get', { name: 'draft', arguments: [] })).code).toBe(INVALID_PARAMS);
    expect(failure(await call('prompts/get', { name: 'nope' })).message).toBe('Unknown prompt: nope');
    expect(failure(await call('prompts/get', {})).message).toBe('prompts/get needs the name of a prompt.');
    expect(result(await call('prompts/get', { name: 'draft' }))['messages']).toBeDefined();
  });

  it('refuses a cursor on every list, since it never issues one', async () => {
    for (const method of ['tools/list', 'resources/list', 'resources/templates/list', 'prompts/list']) {
      expect(failure(await call(method, { cursor: 'x' })).code).toBe(INVALID_PARAMS);
    }
  });

  it('turns an unexpected throw into an internal error', async () => {
    const broken = server({ resources: { list: () => Promise.reject(new Error('disk')), read: async () => null } });
    expect(failure(await broken({ jsonrpc: '2.0', id: 1, method: 'resources/list' }))).toEqual({
      code: INTERNAL_ERROR,
      message: 'Internal error: disk',
    });
    const odd = server({ resources: { list: () => Promise.reject(7), read: async () => null } });
    expect(failure(await odd({ jsonrpc: '2.0', id: 1, method: 'resources/list' })).message).toBe('Internal error: 7');
  });
});

describe('the modern era', () => {
  it('classifies each request by its own claim', () => {
    expect(classifyRequest('tools/list', undefined)).toBe('legacy');
    expect(classifyRequest('tools/list', { _meta: MODERN_META })).toBe('modern');
    expect(classifyRequest('initialize', { _meta: { [PROTOCOL_VERSION_KEY]: 'nope' } })).toBe('legacy');
    expect(() => classifyRequest('tools/list', { _meta: { [PROTOCOL_VERSION_KEY]: '2026-07-28' } })).toThrow(
      `Invalid _meta envelope: ${CLIENT_CAPABILITIES_KEY}: missing`,
    );
  });

  it('wraps results with a type, stale-at-once caching and identity', async () => {
    expect(result(await call('tools/list', { _meta: MODERN_META }))).toEqual({
      resultType: 'complete',
      tools: expect.any(Array),
      ttlMs: 0,
      cacheScope: 'private',
      _meta: { [SERVER_INFO_KEY]: { name: 'demo', version: '1.2.3' } },
    });
    const called = result(await call('tools/call', { name: 'echo', arguments: { text: 'a' }, _meta: MODERN_META }));
    expect(called['ttlMs']).toBeUndefined();
    expect(called['resultType']).toBe('complete');
    const cached = server({ cacheTtlMs: 5000 });
    const listed = await cached({ jsonrpc: '2.0', id: 1, method: 'prompts/list', params: { _meta: MODERN_META } });
    expect(result(listed)['ttlMs']).toBe(5000);
  });

  it('discovers, and has no handshake to answer', async () => {
    expect(result(await call('server/discover', { _meta: MODERN_META }))).toMatchObject({
      supportedVersions: ['2026-07-28'],
      instructions: 'Use it.',
    });
    expect(failure(await call('ping', { _meta: MODERN_META })).code).toBe(METHOD_NOT_FOUND);
  });

  it('refuses a version it does not speak, and a malformed claim', async () => {
    expect(failure(await call('tools/list', { _meta: { ...MODERN_META, [PROTOCOL_VERSION_KEY]: '2030-01-01' } }))).toEqual({
      code: UNSUPPORTED_PROTOCOL_VERSION,
      message: 'Unsupported protocol version',
      data: { supported: ['2026-07-28'], requested: '2030-01-01' },
    });
    expect(failure(await call('tools/list', { _meta: { ...MODERN_META, [CLIENT_INFO_KEY]: { name: 1 } } })).code).toBe(INVALID_PARAMS);
  });

  it.each([
    [{}, `${CLIENT_CAPABILITIES_KEY}: missing`],
    [{ [CLIENT_CAPABILITIES_KEY]: {}, [PROTOCOL_VERSION_KEY]: 7 }, `${PROTOCOL_VERSION_KEY}: expected a string`],
    [{ [CLIENT_CAPABILITIES_KEY]: [], [PROTOCOL_VERSION_KEY]: 'v' }, `${CLIENT_CAPABILITIES_KEY}: expected an object`],
    [
      { [CLIENT_CAPABILITIES_KEY]: {}, [PROTOCOL_VERSION_KEY]: 'v', [CLIENT_INFO_KEY]: { name: 'a' } },
      `${CLIENT_INFO_KEY}: expected an object with a string name and version`,
    ],
    [{ [CLIENT_CAPABILITIES_KEY]: {}, [PROTOCOL_VERSION_KEY]: 'v', [CLIENT_INFO_KEY]: { name: 'a', version: 'b' } }, undefined],
    [{ [CLIENT_CAPABILITIES_KEY]: {}, [PROTOCOL_VERSION_KEY]: 'v' }, undefined],
  ])('finds %j to be %s', (meta, issue) => {
    expect(envelopeIssue(meta)).toBe(issue);
  });
});

describe('messages that are not requests', () => {
  const handle = server();

  it('owes nothing for a notification or a stray response', async () => {
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect(await handle({ jsonrpc: '2.0', id: 3, result: {} })).toBeNull();
    expect(await handle({ jsonrpc: '2.0', id: 3, error: { code: 1, message: 'x' } })).toBeNull();
  });

  it.each([
    [null, 'Invalid Request', undefined],
    [[{ jsonrpc: '2.0', id: 1, method: 'ping' }], 'Invalid Request: batches are not supported', undefined],
    [{ jsonrpc: '1.0', id: 1, method: 'ping' }, 'Invalid Request', 1],
    [{ jsonrpc: '2.0', id: 1 }, 'Invalid Request', 1],
    [{ jsonrpc: '2.0', id: 1.5, method: 'ping' }, 'Invalid Request', undefined],
    [{ jsonrpc: '2.0', id: null, method: 'ping' }, 'Invalid Request', undefined],
  ])('refuses %j', async (message, text, id) => {
    const reply = await handle(message);
    expect(reply).toEqual({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), error: { code: INVALID_REQUEST, message: text } });
  });

  it('refuses params that are not an object, and a method it does not know', async () => {
    expect(failure(await handle({ jsonrpc: '2.0', id: 'a', method: 'ping', params: [1] }))).toEqual({
      code: INVALID_PARAMS,
      message: 'params must be an object.',
    });
    expect(failure(await handle({ jsonrpc: '2.0', id: 'a', method: 'nope' }))).toEqual({ code: METHOD_NOT_FOUND, message: 'Method not found' });
  });
});

/** A byte source a test drives by hand. */
function source(): ByteSource & { push(text: string): void; end(): void; fail(error: Error): void } {
  const listeners: { data: ((chunk: Uint8Array) => void)[]; end: (() => void)[]; error: ((e: Error) => void)[] } = {
    data: [],
    end: [],
    error: [],
  };
  const encoder = new TextEncoder();
  return {
    on: (_event: 'data', listener: (chunk: Uint8Array) => void) => listeners.data.push(listener),
    once: ((event: 'end' | 'error', listener: never) => (listeners[event] as unknown[]).push(listener)) as ByteSource['once'],
    push: (text) => {
      for (const listener of listeners.data) listener(encoder.encode(text));
    },
    end: () => {
      for (const listener of listeners.end) listener();
    },
    fail: (error) => {
      for (const listener of listeners.error) listener(error);
    },
  };
}

describe('serving lines', () => {
  it('frames messages across chunks, skips blank lines, and answers a parse error', async () => {
    const input = source();
    const written: string[] = [];
    const done = serveLines(input, (line) => written.push(line), server());
    input.push('{"jsonrpc":"2.0","id":1,"me');
    input.push('thod":"ping"}\r\n\n   \n');
    input.push('not json\n');
    input.push('{"jsonrpc":"2.0","id":2,"method":"ping"}');
    input.end();
    await done;
    expect(written.map((line) => JSON.parse(line))).toEqual([
      { jsonrpc: '2.0', error: { code: PARSE_ERROR, message: 'Parse error' } },
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 2, result: {} },
    ]);
  });

  it('decodes a character split across chunks', async () => {
    const data: ((chunk: Uint8Array) => void)[] = [];
    const end: (() => void)[] = [];
    const bytes: ByteSource = {
      on: (_event: 'data', listener: (chunk: Uint8Array) => void) => data.push(listener),
      once: ((event: 'end' | 'error', listener: never) => (event === 'end' ? end.push(listener) : 0)) as ByteSource['once'],
    };
    const written: string[] = [];
    const done = serveLines(bytes, (line) => written.push(line), server());
    const accented = String.fromCodePoint(0xe9);
    const encoded = new TextEncoder().encode(`{"jsonrpc":"2.0","id":"${accented}","method":"ping"}
`);
    // Split between the two bytes of the accented character.
    const at = encoded.indexOf(0xc3) + 1;
    data.forEach((listener) => listener(encoded.slice(0, at)));
    data.forEach((listener) => listener(encoded.slice(at)));
    end.forEach((listener) => listener());
    await done;
    expect(written.map((line) => JSON.parse(line))).toEqual([{ jsonrpc: '2.0', id: accented, result: {} }]);
  });

  it('drops the answer to a request the client cancelled, and only that one', async () => {
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
    input.push('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wait"}}\n');
    input.push('{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"wait"}}\n');
    input.push('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}\n');
    input.push('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":99}}\n');
    input.push('{"jsonrpc":"2.0","method":"notifications/cancelled","params":[]}\n');
    input.end();
    release();
    await done;
    expect(written.map((line) => JSON.parse(line)['id'])).toEqual(['1']);
  });

  it('answers requests in the order they finish, and waits for them before resolving', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const staged = createMcpServer({
      name: 's',
      version: '0',
      instructions: '',
      tools: [
        { descriptor: { name: 'late' }, call: async () => (await first, { text: 'late' }) },
        { descriptor: { name: 'early' }, call: async () => ({ text: 'early' }) },
      ],
    });
    const input = source();
    let resolved = false;
    const done = serveLines(input, (line) => order.push(JSON.parse(line)['id']), staged).then(() => {
      resolved = true;
    });
    input.push('{"jsonrpc":"2.0","id":"a","method":"tools/call","params":{"name":"late"}}\n');
    input.push('{"jsonrpc":"2.0","id":"b","method":"tools/call","params":{"name":"early"}}\n');
    input.end();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resolved).toBe(false);
    releaseFirst();
    await done;
    expect(order).toEqual(['b', 'a']);
  });

  it('rejects when the input fails', async () => {
    const input = source();
    const done = serveLines(input, () => undefined, server());
    input.fail(new Error('closed'));
    await expect(done).rejects.toThrow('closed');
  });

  it('writes nothing for a notification', async () => {
    const input = source();
    const written: string[] = [];
    const done = serveLines(input, (line) => written.push(line), server());
    input.push('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    input.end();
    await done;
    expect(written).toEqual([]);
  });
});

describe('what the specifications fix', () => {
  // Written out, not read from the constants: a client knows the
  // specification, not this module.
  it('answers with the error codes of JSON-RPC 2.0', async () => {
    const handle = server();
    const broken = server({ resources: { list: () => Promise.reject(new Error('disk')), read: async () => null } });
    const replies = [
      await handle(null),
      await handle({ jsonrpc: '2.0', id: 1, method: 'nope' }),
      await handle({ jsonrpc: '2.0', id: 1, method: 'ping', params: [1] }),
      await broken({ jsonrpc: '2.0', id: 1, method: 'resources/list' }),
    ];
    expect(replies.map((reply) => failure(reply).code)).toEqual([-32600, -32601, -32602, -32603]);
    const input = source();
    const written: string[] = [];
    const done = serveLines(input, (line) => written.push(line), handle);
    input.push('not json\n');
    input.end();
    await done;
    expect(written).toEqual(['{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error"}}']);
  });

  it('reads and writes the _meta keys of MCP 2026-07-28', async () => {
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/clientInfo': { name: 'client', version: '1' },
    };
    expect(result(await call('tools/list', { _meta: meta }))['_meta']).toEqual({
      'io.modelcontextprotocol/serverInfo': { name: 'demo', version: '1.2.3' },
    });
    expect(failure(await call('tools/list', { _meta: { ...meta, 'io.modelcontextprotocol/clientInfo': { name: 'client' } } }))).toEqual({
      code: -32602,
      message: 'Invalid _meta envelope: io.modelcontextprotocol/clientInfo: expected an object with a string name and version',
    });
  });
});

describe('unknown arguments', () => {
  it('names one, several, and a tool that takes none', () => {
    expect(unknownArguments({ a: 1 }, ['b'])?.text).toBe('Unknown argument "a"; this tool takes b.');
    expect(unknownArguments({ a: 1, c: 2 }, ['b', 'd'])?.text).toBe('Unknown arguments "a", "c"; this tool takes b and d.');
    expect(unknownArguments({ a: 1 }, ['b', 'c', 'd'])?.text).toBe('Unknown argument "a"; this tool takes b, c and d.');
    expect(unknownArguments({ a: 1 }, [])?.text).toBe('Unknown argument "a"; this tool takes no arguments.');
    expect(unknownArguments({ b: 1 }, ['b'])).toBeUndefined();
  });
});
