import { AIProvider } from './provider';
import { EventOverlaySchema, EVENT_OVERLAY_JSON_SCHEMA } from './schema';
import { buildEventPrompt } from './prompt';
import { moderate } from './moderate';
import { GameRoute, StoryNode, LiveOverlay, ValidationError } from '../../shared/types';

export interface EventParams {
  stub: StoryNode;       // the source:'live' node to enrich
  route: GameRoute;      // for title/tone
  ragText: string;       // retrieved novel context ('' when no RAG available)
  pathSummary: string;   // recent choiceLog + reputation, formatted by the caller
}

export interface EventResult { overlay: LiveOverlay; fallback: boolean; attempts: number; }

/** The stub's own text, used as the safe fallback when generation fails or no key is set. */
function stubAsOverlay(stub: StoryNode): LiveOverlay {
  return { prose: stub.prose, choiceTexts: stub.choices.map((c) => c.text) };
}

/**
 * Enrich ONE live node via Flash. Loops prompt → provider → Zod parse → exact
 * choice-count check → moderation, feeding errors back, up to maxAttempts. On
 * exhaustion or an unavailable provider, returns the stub text with fallback:true.
 * Everything except the provider call is pure → fully tested with FakeProvider.
 */
export async function generateEvent(
  provider: AIProvider,
  params: EventParams,
  opts: { maxAttempts?: number } = {},
): Promise<EventResult> {
  const { stub } = params;
  if (!provider.available) return { overlay: stubAsOverlay(stub), fallback: true, attempts: 0 };

  const maxAttempts = opts.maxAttempts ?? 2;
  let lastErrors: ValidationError[] = [];
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const prompt = buildEventPrompt(stub, params.route, params.ragText, params.pathSummary, lastErrors.length ? lastErrors : undefined);
    const raw = await provider.generateStructured(prompt, EVENT_OVERLAY_JSON_SCHEMA, { model: 'flash' });

    // Shape layer.
    const parsed = EventOverlaySchema.safeParse(raw);
    if (!parsed.success) {
      lastErrors = parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: 'BAD_SHAPE' as const, message: i.message }));
      continue;
    }

    // Referential layer: one choice text per existing choice, same order.
    if (parsed.data.choiceTexts.length !== stub.choices.length) {
      lastErrors = [{
        path: 'choiceTexts', code: 'BAD_SHAPE',
        message: `expected ${stub.choices.length} choiceTexts, got ${parsed.data.choiceTexts.length}`,
      }];
      continue;
    }

    // Moderation layer.
    const blocked: ValidationError[] = [];
    const mp = moderate(parsed.data.prose);
    if (!mp.ok) blocked.push({ path: 'prose', code: 'BAD_SHAPE', message: `moderation: ${mp.reason}` });
    parsed.data.choiceTexts.forEach((t, i) => {
      const mc = moderate(t);
      if (!mc.ok) blocked.push({ path: `choiceTexts.${i}`, code: 'BAD_SHAPE', message: `moderation: ${mc.reason}` });
    });
    if (blocked.length) { lastErrors = blocked; continue; }

    return { overlay: { prose: parsed.data.prose, choiceTexts: parsed.data.choiceTexts }, fallback: false, attempts };
  }

  return { overlay: stubAsOverlay(stub), fallback: true, attempts };
}
