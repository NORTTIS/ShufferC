import { GenBundleSchema, GEN_BUNDLE_JSON_SCHEMA, EventOverlaySchema, EVENT_OVERLAY_JSON_SCHEMA, CONTENT_TOOL_DEFS } from './schema';
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

describe('CONTENT_TOOL_DEFS', () => {
  it('exposes the five create tools plus submit_route', () => {
    const names = CONTENT_TOOL_DEFS.map((t) => t.name).sort();
    expect(names).toEqual(['create_attribute', 'create_effect', 'create_enemy', 'create_item', 'create_skill', 'submit_route']);
  });

  it('every tool has a description and an object JSON-schema for parameters', () => {
    for (const t of CONTENT_TOOL_DEFS) {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.parameters && typeof t.parameters).toBe('object');
    }
  });
});
