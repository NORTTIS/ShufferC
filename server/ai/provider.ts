/** Thin LLM boundary. Returns parsed JSON; it does NOT validate — frameworkGen owns validation + retry. */
export interface AIProvider {
  readonly available: boolean;                                              // false when no API key
  generateStructured(prompt: string, jsonSchema: object): Promise<unknown>;
}

/**
 * Deterministic test double. Each call shifts the next canned response off the queue,
 * so a test can script "attempt 1 invalid → attempt 2 valid" to drive the retry path.
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
