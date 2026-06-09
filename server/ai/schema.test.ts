import { GenBundleSchema, GEN_BUNDLE_JSON_SCHEMA, EventOverlaySchema, EVENT_OVERLAY_JSON_SCHEMA } from './schema';
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

describe('EventOverlaySchema', () => {
  it('parses a well-formed overlay', () => {
    const r = EventOverlaySchema.safeParse({ prose: 'hello', choiceTexts: ['a', 'b'] });
    expect(r.success).toBe(true);
  });
  it('rejects an empty prose string', () => {
    const r = EventOverlaySchema.safeParse({ prose: '', choiceTexts: [] });
    expect(r.success).toBe(false);
  });
  it('rejects an empty choice text', () => {
    const r = EventOverlaySchema.safeParse({ prose: 'x', choiceTexts: [''] });
    expect(r.success).toBe(false);
  });
  it('exposes a non-empty JSON schema', () => {
    expect(typeof EVENT_OVERLAY_JSON_SCHEMA).toBe('object');
    expect(Object.keys(EVENT_OVERLAY_JSON_SCHEMA as object).length).toBeGreaterThan(0);
  });
});
