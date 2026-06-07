import { AIProvider } from './provider';
import { RouteBundleSchema, ROUTE_BUNDLE_JSON_SCHEMA } from './schema';
import { buildFrameworkPrompt } from './prompt';
import { moderate } from './moderate';
import { validateRouteBundle } from '../../shared/validation';
import { GenerationParams, Registries, GenerationResult, RouteBundle, ValidationError } from '../../shared/types';

/**
 * Orchestrates one framework generation. Loops prompt → provider → Zod parse →
 * referential validate → moderate, feeding errors back into the next prompt, up
 * to maxAttempts. Admin-in-loop, so failing is acceptable — no fallback node here.
 */
export async function generateFramework(
  provider: AIProvider,
  params: GenerationParams,
  reg: Registries,
  opts: { maxAttempts?: number } = {},
): Promise<GenerationResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErrors: ValidationError[] = [];
  let lastRaw: unknown;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const prompt = buildFrameworkPrompt(params, reg, lastErrors.length ? lastErrors : undefined);
    const raw = await provider.generateStructured(prompt, ROUTE_BUNDLE_JSON_SCHEMA);
    lastRaw = raw;

    // Shape layer.
    const parsed = RouteBundleSchema.safeParse(raw);
    if (!parsed.success) {
      lastErrors = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: 'BAD_SHAPE' as const,
        message: i.message,
      }));
      continue;
    }

    const bundle = parsed.data as unknown as RouteBundle;

    // Referential layer.
    const refErrors = validateRouteBundle(bundle, reg);
    if (refErrors.length) {
      lastErrors = refErrors;
      continue;
    }

    // Moderation layer.
    const modErrors: ValidationError[] = [];
    for (const [nid, node] of Object.entries(bundle.nodes)) {
      const m = moderate(node.prose);
      if (!m.ok) modErrors.push({ path: `nodes.${nid}.prose`, code: 'BAD_SHAPE', message: `moderation: ${m.reason}` });
    }
    if (modErrors.length) {
      lastErrors = modErrors;
      continue;
    }

    bundle.route.status = 'draft';
    bundle.route.sourceNovelId = params.sourceNovelId ?? 'adhoc';
    return { ok: true, bundle, attempts };
  }

  return { ok: false, errors: lastErrors, attempts, lastRaw };
}
