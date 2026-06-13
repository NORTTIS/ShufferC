import { createOpenRouterProvider } from './openrouter';

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

beforeEach(() => mockFetch.mockReset());

function okResponse(content: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
  } as Response);
}

describe('createOpenRouterProvider', () => {
  it('is available when apiKey is set', () => {
    const p = createOpenRouterProvider({ apiKey: 'key', proModel: 'a/b', flashModel: 'c/d' });
    expect(p.available).toBe(true);
  });

  it('posts JSON to OpenRouter and returns parsed response', async () => {
    mockFetch.mockReturnValueOnce(okResponse({ result: 42 }));
    const p = createOpenRouterProvider({ apiKey: 'sk-key', proModel: 'pro/m', flashModel: 'flash/m' });
    const result = await p.generateStructured('my prompt', { type: 'object' });
    expect(result).toEqual({ result: 42 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('pro/m');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('uses flashModel when opts.model === "flash"', async () => {
    mockFetch.mockReturnValueOnce(okResponse({}));
    const p = createOpenRouterProvider({ apiKey: 'k', proModel: 'pro', flashModel: 'flash' });
    await p.generateStructured('prompt', {}, { model: 'flash' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('flash');
  });

  it('includes schema in system message and prompt in user message', async () => {
    mockFetch.mockReturnValueOnce(okResponse({ x: 1 }));
    const schema = { type: 'object', properties: { x: { type: 'number' } } };
    const p = createOpenRouterProvider({ apiKey: 'k', proModel: 'm', flashModel: 'm' });
    await p.generateStructured('user prompt', schema);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain(JSON.stringify(schema));
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('user prompt');
  });

  it('throws when OpenRouter returns empty choices', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ choices: [] }),
    } as Response));
    const p = createOpenRouterProvider({ apiKey: 'k', proModel: 'm', flashModel: 'm' });
    await expect(p.generateStructured('p', {})).rejects.toThrow(/no choices/i);
  });

  it('throws on HTTP error from OpenRouter', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    } as Response));
    const p = createOpenRouterProvider({ apiKey: 'k', proModel: 'm', flashModel: 'm' });
    await expect(p.generateStructured('p', {})).rejects.toThrow('429');
  });
});
