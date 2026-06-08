/** Per-call generation options. `model` selects which Gemini tier to use; defaults to 'pro'. */
export interface GenerateOptions { model?: 'pro' | 'flash'; }

/** Thin LLM boundary. Returns parsed JSON; it does NOT validate — callers own validation + retry. */
export interface AIProvider {
  readonly available: boolean;                                              // false when no API key
  generateStructured(prompt: string, jsonSchema: object, opts?: GenerateOptions): Promise<unknown>;
}

/**
 * Deterministic test double. Each call shifts the next canned response off the queue,
 * so a test can script "attempt 1 invalid → attempt 2 valid" to drive the retry path.
 * Ignores the prompt, schema, and options.
 */
export function createFakeProvider(responses: unknown[]): AIProvider {
  const queue = [...responses];
  return {
    available: true,
    async generateStructured(): Promise<unknown> {
      if (queue.length === 0) throw new Error('FakeProvider: response queue exhausted');
      return queue.shift();
    },
  };
}
