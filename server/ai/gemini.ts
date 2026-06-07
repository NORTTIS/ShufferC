import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider } from './provider';

export interface GeminiConfig {
  apiKey: string | null;
  proModel: string;
  flashModel: string;
}

/**
 * Real Gemini provider. Uses the Pro model for framework generation with JSON
 * response mode + the passed responseSchema. When no API key is configured the
 * provider reports `available:false` and never touches the network (so the server
 * boots and tests run without a key). Smoke-tested manually, never in Jest.
 */
export function createGeminiProvider(cfg: GeminiConfig): AIProvider {
  const available = !!cfg.apiKey;
  const client = available ? new GoogleGenerativeAI(cfg.apiKey as string) : null;

  return {
    available,
    async generateStructured(prompt: string, jsonSchema: object): Promise<unknown> {
      if (!client) throw new Error('Gemini provider unavailable: no API key');
      const model = client.getGenerativeModel({
        model: cfg.proModel,
        generationConfig: {
          responseMimeType: 'application/json',
          // The SDK's responseSchema type is narrower than a generic JSON schema; cast through unknown.
          responseSchema: jsonSchema as unknown as never,
        },
      });
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    },
  };
}
