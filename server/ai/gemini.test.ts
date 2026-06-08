import { createGeminiProvider, sanitizeForGemini } from './gemini';
import { ROUTE_BUNDLE_JSON_SCHEMA } from './schema';

const BANNED = ['$schema', '$id', '$ref', '$defs', 'definitions', 'additionalProperties', 'propertyNames', 'patternProperties'];

function hasKeyDeep(node: unknown, key: string): boolean {
  if (Array.isArray(node)) return node.some((n) => hasKeyDeep(n, key));
  if (node && typeof node === 'object') {
    return Object.entries(node).some(([k, v]) => k === key || hasKeyDeep(v, key));
  }
  return false;
}

describe('sanitizeForGemini', () => {
  it('strips every Gemini-unsupported keyword from the real route schema', () => {
    // Guards the live 400: Gemini rejects full-JSON-Schema keywords in responseSchema.
    const sanitized = sanitizeForGemini(ROUTE_BUNDLE_JSON_SCHEMA);
    for (const key of BANNED) {
      expect(hasKeyDeep(sanitized, key)).toBe(false);
    }
  });

  it('preserves supported structure (type/properties/items/enum)', () => {
    const sanitized = sanitizeForGemini({
      $schema: 'x', type: 'object', additionalProperties: false,
      properties: { a: { type: 'string', enum: ['x', 'y'] }, list: { type: 'array', items: { type: 'number' } } },
      required: ['a'],
    }) as Record<string, any>;
    expect(sanitized.type).toBe('object');
    expect(sanitized.$schema).toBeUndefined();
    expect(sanitized.additionalProperties).toBeUndefined();
    expect(sanitized.properties.a.enum).toEqual(['x', 'y']);
    expect(sanitized.properties.list.items.type).toBe('number');
    expect(sanitized.required).toEqual(['a']);
  });
});

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
