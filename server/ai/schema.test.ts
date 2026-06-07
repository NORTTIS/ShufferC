import { RouteBundleSchema, ROUTE_BUNDLE_JSON_SCHEMA } from './schema';
import { SAMPLE_BUNDLE } from '../../shared/fixtures';

describe('RouteBundleSchema', () => {
  it('parses the valid sample bundle', () => {
    const res = RouteBundleSchema.safeParse(structuredClone(SAMPLE_BUNDLE));
    expect(res.success).toBe(true);
  });

  it('rejects a bundle missing route.title', () => {
    const b = structuredClone(SAMPLE_BUNDLE) as Record<string, any>;
    delete b.route.title;
    expect(RouteBundleSchema.safeParse(b).success).toBe(false);
  });

  it('rejects a node with a wrong field type', () => {
    const b = structuredClone(SAMPLE_BUNDLE) as Record<string, any>;
    b.nodes.n1.prose = 123; // should be string
    expect(RouteBundleSchema.safeParse(b).success).toBe(false);
  });

  it('exports a non-empty JSON schema object for Gemini', () => {
    expect(typeof ROUTE_BUNDLE_JSON_SCHEMA).toBe('object');
    expect(Object.keys(ROUTE_BUNDLE_JSON_SCHEMA).length).toBeGreaterThan(0);
  });
});
