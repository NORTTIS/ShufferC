import { emptyContentSet, mergeContent, toValidationCtx, toRegistries } from './contentSet';
import { ContentSet } from '../../shared/types';

const base = (): ContentSet => ({
  attributes: { str: { id: 'str', name: 'Strength', abbrev: 'STR', roles: ['core'], builtin: true } },
  effects: {}, items: {}, skills: {},
  enemies: { goblin: { id: 'goblin', name: 'Goblin', stats: { str: 3 }, hp: 5, skillPriority: [] } },
});

describe('contentSet helpers', () => {
  it('emptyContentSet has five empty maps', () => {
    expect(emptyContentSet()).toEqual({ attributes: {}, effects: {}, items: {}, skills: {}, enemies: {} });
  });

  it('mergeContent overlays staged onto global without mutating either', () => {
    const g = base();
    const staged = emptyContentSet();
    staged.enemies['wraith'] = { id: 'wraith', name: 'Wraith', stats: { str: 7 }, hp: 9, skillPriority: [] };
    const merged = mergeContent(g, staged);
    expect(Object.keys(merged.enemies).sort()).toEqual(['goblin', 'wraith']);
    expect(Object.keys(g.enemies)).toEqual(['goblin']); // unchanged
  });

  it('toValidationCtx exposes the four ref-checked registries', () => {
    expect(Object.keys(toValidationCtx(base())).sort()).toEqual(['attributes', 'effects', 'items', 'skills']);
  });

  it('toRegistries maps to itemDb/skillDb/enemyDb', () => {
    const r = toRegistries(base());
    expect(r.enemyDb.goblin.name).toBe('Goblin');
    expect(Object.keys(r).sort()).toEqual(['enemyDb', 'itemDb', 'skillDb']);
  });
});
