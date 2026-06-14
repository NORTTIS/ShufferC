import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, GenerateOptions, StopToolLoop, ToolDef, ToolHandler } from './provider';

export interface GeminiConfig {
  apiKey: string | null;
  proModel: string;
  flashModel: string;
  embedModel: string;
}

// Gemini's responseSchema is a restricted OpenAPI subset, NOT full JSON Schema.
// zod's z.toJSONSchema() emits keywords Gemini rejects with HTTP 400 ($schema,
// additionalProperties, propertyNames — the last two from z.record). Strip them
// recursively. Correctness is still enforced afterwards by the Zod parse +
// validateRouteBundle in frameworkGen, so dropping these constraints is safe.
const UNSUPPORTED_KEYS = new Set([
  '$schema', '$id', '$ref', '$defs', 'definitions',
  'additionalProperties', 'propertyNames', 'patternProperties',
]);

export function sanitizeForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeForGemini);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (UNSUPPORTED_KEYS.has(key)) continue;
      out[key] = sanitizeForGemini(value);
    }
    // Reconcile `required` against `properties`. zod renders an enum-keyed record
    // (e.g. statDelta) with its keys in additionalProperties/propertyNames but
    // still lists them in `required`. Once we strip those, the required entries
    // point at properties that don't exist and Gemini rejects them. Drop any
    // required entry without a matching property (and drop `required` if empty).
    if (Array.isArray(out.required)) {
      const props = out.properties && typeof out.properties === 'object'
        ? (out.properties as Record<string, unknown>)
        : {};
      const propKeys = new Set(Object.keys(props));
      const kept = (out.required as unknown[]).filter((r) => typeof r === 'string' && propKeys.has(r));
      if (kept.length) out.required = kept;
      else delete out.required;
    }
    return out;
  }
  return node;
}

/**
 * Real Gemini provider. Uses the Pro model by default (framework generation);
 * callers pass `{ model: 'flash' }` for live event-gen. JSON response mode +
 * the passed responseSchema (sanitized to Gemini's subset). When no API key is
 * configured the provider reports `available:false` and never touches the
 * network (so the server boots and tests run without a key). Smoke-tested
 * manually, never in Jest.
 */
export function createGeminiProvider(cfg: GeminiConfig): AIProvider {
  const available = !!cfg.apiKey;
  const client = available ? new GoogleGenerativeAI(cfg.apiKey as string) : null;

  return {
    available,
    async generateStructured(prompt: string, jsonSchema: object, opts?: GenerateOptions): Promise<unknown> {
      if (!client) throw new Error('Gemini provider unavailable: no API key');
      const modelName = opts?.model === 'flash' ? cfg.flashModel : cfg.proModel;
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          // Strip JSON-Schema keywords Gemini doesn't accept; cast through unknown
          // because the SDK's responseSchema type is narrower than a generic schema.
          responseSchema: sanitizeForGemini(jsonSchema) as unknown as never,
        },
      });
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    },
    async generateWithTools(
      prompt: string,
      tools: ToolDef[],
      handler: ToolHandler,
      opts?: GenerateOptions & { maxToolCalls?: number },
    ): Promise<void> {
      if (!client) throw new Error('Gemini provider unavailable: no API key');
      const modelName = opts?.model === 'flash' ? cfg.flashModel : cfg.proModel;
      const max = opts?.maxToolCalls ?? 30;
      const functionDeclarations = tools.map((t) => ({
        name: t.name,
        description: t.description,
        // Gemini's parameters use the same restricted subset as responseSchema.
        parameters: sanitizeForGemini(t.parameters) as never,
      }));
      const model = client.getGenerativeModel({
        model: modelName,
        tools: [{ functionDeclarations }] as never,
      });
      const chat = model.startChat();
      let result = await chat.sendMessage(prompt);
      let count = 0;
      // Loop: model emits functionCall(s) → run handler → send functionResponse(s) → repeat.
      while (true) {
        const calls = result.response.functionCalls() ?? [];
        if (!calls.length) return; // model produced no further calls — generation is done
        if (count >= max) return;  // limit check before batch, never mid-batch
        const responses: unknown[] = [];
        for (const call of calls) {
          count++;
          let out: unknown;
          try {
            out = await handler({ name: call.name, args: call.args });
          } catch (e) {
            if (e instanceof StopToolLoop) return;
            throw e;
          }
          responses.push({ functionResponse: { name: call.name, response: { result: out } } });
        }
        result = await chat.sendMessage(responses as never);
      }
    },
  };
}
