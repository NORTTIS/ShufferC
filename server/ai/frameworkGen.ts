import { AIProvider, ToolCall } from './provider';
import { CONTENT_TOOL_DEFS } from './schema';
import { buildToolPrompt } from './prompt';
import { moderate } from './moderate';
import { validateRouteBundle } from '../../shared/validation';
import {
  validateAttribute, validateEffect, validateItem, validateSkill, validateEnemy,
} from '../api/contentValidation';
import { emptyContentSet, mergeContent, toValidationCtx, toRegistries } from './contentSet';
import {
  GenerationParams, ContentSet, GenerationResult, RouteBundle, StoryNode, ValidationError,
} from '../../shared/types';
import { GameError } from '../session';

/**
 * Orchestrates one tool-driven framework generation. The model calls create_* tools to mint
 * content (validated against globalContent ∪ staged) and a terminal submit_route tool. The
 * loop logic lives here; the provider only transports the function-calling exchange.
 */
export async function generateFramework(
  provider: AIProvider,
  params: GenerationParams,
  global: ContentSet,
  opts: { maxToolCalls?: number } = {},
): Promise<GenerationResult> {
  const maxToolCalls = opts.maxToolCalls ?? 30;
  const staged = emptyContentSet();
  let finalBundle: RouteBundle | null = null;
  let lastErrors: ValidationError[] = [];
  let toolCalls = 0;

  const asErrors = (message: string): ValidationError[] => [{ path: '', code: 'BAD_SHAPE', message }];

  // Stage a validated entity, rejecting ids that collide with global or already-staged content.
  const stage = (kind: keyof ContentSet, e: { id: string }) => {
    const g = global[kind] as Record<string, unknown>;
    const s = staged[kind] as Record<string, unknown>;
    if (g[e.id] || s[e.id]) {
      const errors = asErrors(`${e.id} already exists`);
      lastErrors = errors;
      return { ok: false, errors };
    }
    s[e.id] = e;
    return { ok: true, id: e.id };
  };

  const handler = async (call: ToolCall): Promise<unknown> => {
    toolCalls++;
    const merged = mergeContent(global, staged);
    const ctx = toValidationCtx(merged);
    try {
      switch (call.name) {
        case 'create_attribute': return stage('attributes', validateAttribute(call.args));
        case 'create_effect':    return stage('effects', validateEffect(call.args, ctx));
        case 'create_skill':     return stage('skills', validateSkill(call.args, ctx));
        case 'create_item':      return stage('items', validateItem(call.args, ctx));
        case 'create_enemy':     return stage('enemies', validateEnemy(call.args, ctx));
        case 'submit_route': {
          const args = call.args as { route: RouteBundle['route']; nodes: StoryNode[] };
          const nodes: Record<string, StoryNode> = {};
          for (const n of args.nodes ?? []) nodes[n.id] = n;
          const bundle: RouteBundle = { route: args.route, nodes, stagedContent: staged };
          const errs = [...validateRouteBundle(bundle, toRegistries(merged))];
          for (const [nid, node] of Object.entries(nodes)) {
            const m = moderate(node.prose);
            if (!m.ok) errs.push({ path: `nodes.${nid}.prose`, code: 'BAD_SHAPE', message: `moderation: ${m.reason}` });
          }
          if (errs.length) { lastErrors = errs; return { ok: false, errors: errs }; }
          bundle.route.status = 'draft';
          bundle.route.sourceNovelId = params.sourceNovelId ?? 'adhoc';
          // Snapshot staged so later tool calls (the fake provider drains its whole script) can't mutate the captured bundle.
          finalBundle = { ...bundle, stagedContent: structuredClone(staged) };
          return { ok: true };
        }
        default: {
          const errors = asErrors(`unknown tool ${call.name}`);
          lastErrors = errors;
          return { ok: false, errors };
        }
      }
    } catch (e) {
      const errors = asErrors(e instanceof GameError ? e.message : String(e));
      lastErrors = errors;
      return { ok: false, errors };
    }
  };

  await provider.generateWithTools(buildToolPrompt(params, global), CONTENT_TOOL_DEFS, handler, { maxToolCalls });

  if (finalBundle) return { ok: true, bundle: finalBundle, toolCalls };
  return { ok: false, errors: lastErrors.length ? lastErrors : asErrors('no route submitted'), toolCalls };
}
