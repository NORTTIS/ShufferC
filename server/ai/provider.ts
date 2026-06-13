/** Per-call generation options. `model` selects which Gemini tier to use; defaults to 'pro'. */
export interface GenerateOptions { model?: 'pro' | 'flash'; }

/** A tool the model may call. `parameters` is a JSON Schema for the tool's args. */
export interface ToolDef { name: string; description: string; parameters: object; }
/** One tool invocation emitted by the model. */
export interface ToolCall { name: string; args: any; }
/** Executes a single tool call and returns the result that is fed back to the model. */
export type ToolHandler = (call: ToolCall) => Promise<unknown>;

/** Thin LLM boundary. Returns parsed JSON / drives a tool loop; it does NOT validate. */
export interface AIProvider {
  readonly available: boolean;
  generateStructured(prompt: string, jsonSchema: object, opts?: GenerateOptions): Promise<unknown>;
  generateWithTools(
    prompt: string,
    tools: ToolDef[],
    handler: ToolHandler,
    opts?: GenerateOptions & { maxToolCalls?: number },
  ): Promise<void>;
}

/**
 * Deterministic structured-output double. Each call shifts the next canned response off
 * the queue. generateWithTools is intentionally unsupported — use createFakeToolProvider.
 */
export function createFakeProvider(responses: unknown[]): AIProvider {
  const queue = [...responses];
  return {
    available: true,
    async generateStructured(): Promise<unknown> {
      if (queue.length === 0) throw new Error('FakeProvider: response queue exhausted');
      return queue.shift();
    },
    async generateWithTools(): Promise<void> {
      throw new Error('FakeProvider: generateWithTools not scripted — use createFakeToolProvider');
    },
  };
}

/**
 * Deterministic tool-loop double. `turns` is one entry per model turn; each entry is the
 * list of tool calls that turn makes. The handler runs for each call in order, honoring
 * maxToolCalls. Ignores the prompt, tool defs, and the handler's return value.
 */
export function createFakeToolProvider(turns: ToolCall[][]): AIProvider {
  return {
    available: true,
    async generateStructured(): Promise<unknown> {
      throw new Error('createFakeToolProvider: generateStructured not supported');
    },
    async generateWithTools(_prompt, _tools, handler, opts): Promise<void> {
      const max = opts?.maxToolCalls ?? Infinity;
      let count = 0;
      for (const turn of turns) {
        for (const call of turn) {
          if (count >= max) return;
          count++;
          await handler(call);
        }
      }
    },
  };
}
