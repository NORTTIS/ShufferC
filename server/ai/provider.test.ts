import { createFakeProvider, createFakeToolProvider, ToolCall } from './provider';

describe('createFakeProvider', () => {
  it('is available and returns scripted responses in order', async () => {
    const p = createFakeProvider([{ a: 1 }, { b: 2 }]);
    expect(p.available).toBe(true);
    expect(await p.generateStructured('ignored', {})).toEqual({ a: 1 });
    expect(await p.generateStructured('ignored', {})).toEqual({ b: 2 });
  });

  it('throws when the queue is exhausted (loud test-script failure)', async () => {
    const p = createFakeProvider([]);
    await expect(p.generateStructured('x', {})).rejects.toThrow(/exhausted/i);
  });
});

describe('AIProvider options', () => {
  it('FakeProvider accepts and ignores a model option, still returning the queued response', async () => {
    const p = createFakeProvider([{ ok: 1 }]);
    const out = await p.generateStructured('prompt', {}, { model: 'flash' });
    expect(out).toEqual({ ok: 1 });
  });
});

describe('createFakeToolProvider', () => {
  it('replays scripted tool calls through the handler in order', async () => {
    const provider = createFakeToolProvider([
      [{ name: 'create_effect', args: { id: 'frost' } }],
      [{ name: 'submit_route', args: { route: {}, nodes: [] } }],
    ]);
    const seen: string[] = [];
    await provider.generateWithTools('p', [], async (c: ToolCall) => { seen.push(c.name); return { ok: true }; });
    expect(seen).toEqual(['create_effect', 'submit_route']);
  });

  it('stops after maxToolCalls', async () => {
    const provider = createFakeToolProvider([
      [{ name: 'a', args: {} }, { name: 'b', args: {} }, { name: 'c', args: {} }],
    ]);
    const seen: string[] = [];
    await provider.generateWithTools('p', [], async (c) => { seen.push(c.name); return {}; }, { maxToolCalls: 2 });
    expect(seen).toEqual(['a', 'b']);
  });

  it('createFakeProvider rejects generateWithTools (use the tool provider)', async () => {
    await expect(createFakeProvider([]).generateWithTools('p', [], async () => ({}))).rejects.toThrow();
  });
});
