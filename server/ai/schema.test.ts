import { GenBundleSchema, GEN_BUNDLE_JSON_SCHEMA } from './schema';
import { SAMPLE_BUNDLE } from '../../shared/fixtures';

// Gen form = the shape the model emits: nodes as an array (not a keyed record).
const genForm = () => ({
  route: structuredClone(SAMPLE_BUNDLE.route),
  nodes: Object.values(structuredClone(SAMPLE_BUNDLE.nodes)),
});

describe('GenBundleSchema', () => {
  it('parses a valid gen bundle (nodes as an array)', () => {
    const res = GenBundleSchema.safeParse(genForm());
    expect(res.success).toBe(true);
  });

  it('rejects a bundle missing route.title', () => {
    const b = genForm() as Record<string, any>;
    delete b.route.title;
    expect(GenBundleSchema.safeParse(b).success).toBe(false);
  });

  it('rejects a node with a wrong field type', () => {
    const b = genForm() as Record<string, any>;
    b.nodes[0].prose = 123; // should be string
    expect(GenBundleSchema.safeParse(b).success).toBe(false);
  });

  it('rejects nodes given as an object instead of an array', () => {
    const b = { route: structuredClone(SAMPLE_BUNDLE.route), nodes: structuredClone(SAMPLE_BUNDLE.nodes) };
    expect(GenBundleSchema.safeParse(b).success).toBe(false);
  });

  it('exports a non-empty JSON schema object for Gemini', () => {
    expect(typeof GEN_BUNDLE_JSON_SCHEMA).toBe('object');
    expect(Object.keys(GEN_BUNDLE_JSON_SCHEMA).length).toBeGreaterThan(0);
  });
});
