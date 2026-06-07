import { createGeminiProvider } from './gemini';

describe('createGeminiProvider', () => {
  it('is unavailable and rejects when no API key is configured', async () => {
    const p = createGeminiProvider({ apiKey: null, proModel: 'gemini-1.5-pro', flashModel: 'gemini-1.5-flash' });
    expect(p.available).toBe(false);
    await expect(p.generateStructured('hi', {})).rejects.toThrow(/unavailable/i);
  });

  it('reports available when an API key is present', () => {
    const p = createGeminiProvider({ apiKey: 'test-key', proModel: 'gemini-1.5-pro', flashModel: 'gemini-1.5-flash' });
    expect(p.available).toBe(true);
  });
});
