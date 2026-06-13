import { AIProvider, GenerateOptions } from './provider';

export interface OpenRouterConfig {
  apiKey: string;
  proModel: string;
  flashModel: string;
}

export function createOpenRouterProvider(cfg: OpenRouterConfig): AIProvider {
  return {
    available: true,
    async generateStructured(
      prompt: string,
      jsonSchema: object,
      opts?: GenerateOptions,
    ): Promise<unknown> {
      const model = opts?.model === 'flash' ? cfg.flashModel : cfg.proModel;
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `Respond with valid JSON matching this schema: ${JSON.stringify(jsonSchema)}`,
            },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${text}`);
      }
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      const choice = data.choices?.[0];
      if (!choice) throw new Error(`OpenRouter: no choices in response`);
      return JSON.parse(choice.message.content);
    },
  };
}
