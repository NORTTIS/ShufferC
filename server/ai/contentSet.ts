import { ContentSet, Registries } from '../../shared/types';
import { ValidationCtx } from '../api/contentValidation';

export function emptyContentSet(): ContentSet {
  return { attributes: {}, effects: {}, items: {}, skills: {}, enemies: {} };
}

/** Returns a new ContentSet where `overlay` entries win over `base`. Neither input is mutated. */
export function mergeContent(base: ContentSet, overlay: ContentSet): ContentSet {
  return {
    attributes: { ...base.attributes, ...overlay.attributes },
    effects: { ...base.effects, ...overlay.effects },
    items: { ...base.items, ...overlay.items },
    skills: { ...base.skills, ...overlay.skills },
    enemies: { ...base.enemies, ...overlay.enemies },
  };
}

/** The subset the content validators need (attributes/effects/items/skills). */
export function toValidationCtx(s: ContentSet): ValidationCtx {
  return { attributes: s.attributes, effects: s.effects, items: s.items, skills: s.skills };
}

/** The subset validateRouteBundle needs (items/skills/enemies/attributes). */
export function toRegistries(s: ContentSet): Registries {
  return { itemDb: s.items, skillDb: s.skills, enemyDb: s.enemies, attrDb: s.attributes };
}
