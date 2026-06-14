import { AttributeDef, AttributeRole, EffectTemplate, Item, Skill, Enemy, StatusEffect } from '../../shared/types';
import { GameError } from '../session';

export interface ValidationCtx {
  attributes: Record<string, AttributeDef>;
  effects: Record<string, EffectTemplate>;
  items: Record<string, Item>;
  skills: Record<string, Skill>;
}

const ROLES: AttributeRole[] = ['core', 'defense', 'maxHp'];
const SLOTS = ['weapon', 'armor', 'ring', 'scroll', 'quest'];
const ARCHETYPES = ['dot', 'hot', 'statMod', 'control'];
const KINDS = ['buff', 'debuff', 'dot', 'hot', 'control'];

export function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new GameError(`${field} is required`, 400);
  return v;
}
export function slug(v: unknown, field: string): string {
  const s = str(v, field);
  if (!/^[a-zA-Z0-9_]+$/.test(s)) throw new GameError(`${field} must be alphanumeric/underscore`, 400);
  return s;
}
export function nonNegInt(v: unknown, field: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new GameError(`${field} must be ≥ 0`, 400);
  return v;
}
export function posInt(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new GameError(`${field} must be an integer ≥ 1`, 400);
  return v;
}
export function arr(v: unknown, field: string): any[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new GameError(`${field} must be an array`, 400);
  return v;
}
export function obj(v: unknown, field: string): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new GameError(`${field} must be an object`, 400);
  return v as Record<string, unknown>;
}
export function refEffect(e: StatusEffect, ctx: ValidationCtx): StatusEffect {
  if (!ctx.effects[e?.id]) throw new GameError(`Unknown effect ${e?.id}`, 400);
  return { id: e.id, kind: ctx.effects[e.id].kind, duration: nonNegInt(e.duration, 'duration') ?? 0, magnitude: e.magnitude };
}

export function validateAttribute(body: any): AttributeDef {
  const roles = Array.isArray(body?.roles) ? body.roles : [];
  if (roles.length === 0 || roles.some((r: string) => !ROLES.includes(r as AttributeRole))) {
    throw new GameError(`roles must be a non-empty subset of ${ROLES.join(', ')}`, 400);
  }
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), abbrev: str(body.abbrev, 'abbrev'),
    roles, defaultBase: nonNegInt(body.defaultBase, 'defaultBase'), builtin: false };
}

export function validateEffect(body: any, ctx: ValidationCtx): EffectTemplate {
  if (!ARCHETYPES.includes(body?.archetype)) throw new GameError('invalid archetype', 400);
  if (!KINDS.includes(body?.kind)) throw new GameError('invalid kind', 400);
  if (body.archetype === 'statMod' && !ctx.attributes[body?.stat]) throw new GameError(`statMod needs a valid stat`, 400);
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), archetype: body.archetype, kind: body.kind,
    stat: body.archetype === 'statMod' ? body.stat : undefined,
    magnitude: typeof body.magnitude === 'number' ? body.magnitude : undefined,
    duration: nonNegInt(body.duration, 'duration'), instant: !!body.instant, sprite: body.sprite, builtin: false };
}

export function validateItem(body: any, ctx: ValidationCtx): Item {
  if (!SLOTS.includes(body?.slot)) throw new GameError('invalid slot', 400);
  if (body?.kind !== 'gear' && body?.kind !== 'consumable') throw new GameError('invalid kind', 400);
  const statMods: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(body?.statMods, 'statMods'))) {
    if (!ctx.attributes[k]) throw new GameError(`Unknown attribute ${k}`, 400);
    if (typeof v !== 'number') throw new GameError(`statMods.${k} must be a number`, 400);
    statMods[k] = v;
  }
  for (const sid of arr(body?.grantsSkills, 'grantsSkills')) if (!ctx.skills[sid]) throw new GameError(`Unknown skill ${sid}`, 400);
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), slot: body.slot, kind: body.kind,
    cost: nonNegInt(body.cost, 'cost'), statMods: Object.keys(statMods).length ? statMods : undefined,
    onEquip: arr(body.onEquip, 'onEquip').map((e: StatusEffect) => refEffect(e, ctx)),
    onUse: arr(body.onUse, 'onUse').map((e: StatusEffect) => refEffect(e, ctx)),
    grantsSkills: body.grantsSkills ?? undefined, sprite: body.sprite, storyTags: body.storyTags ?? [] };
}

export function validateSkill(body: any, ctx: ValidationCtx): Skill {
  if (body?.targetStat && !ctx.attributes[body.targetStat]) throw new GameError(`Unknown attribute ${body.targetStat}`, 400);
  if (body?.effectTarget && body.effectTarget !== 'self' && body.effectTarget !== 'enemy') throw new GameError('invalid effectTarget', 400);
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), targetStat: body.targetStat,
    effectTarget: body.effectTarget, power: typeof body.power === 'number' ? body.power : undefined,
    effects: arr(body.effects, 'effects').map((e: StatusEffect) => refEffect(e, ctx)), sprite: body.sprite };
}

export function validateEnemy(body: any, ctx: ValidationCtx): Enemy {
  const stats: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(body?.stats, 'stats'))) {
    if (!ctx.attributes[k]) throw new GameError(`Unknown attribute ${k}`, 400);
    if (typeof v !== 'number') throw new GameError(`stats.${k} must be a number`, 400);
    stats[k] = v;
  }
  for (const sid of arr(body?.skillPriority, 'skillPriority')) if (!ctx.skills[sid]) throw new GameError(`Unknown skill ${sid}`, 400);
  for (const d of arr(body?.reward?.drops, 'reward.drops')) if (!ctx.items[d?.itemId]) throw new GameError(`Unknown item ${d?.itemId}`, 400);
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), stats, hp: posInt(body.hp, 'hp'),
    skillPriority: body.skillPriority ?? [], sprite: body.sprite, reward: body.reward };
}
