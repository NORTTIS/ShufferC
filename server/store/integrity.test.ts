import { createMemoryContentStores } from './contentStores';
import { findReferences } from './integrity';

describe('findReferences', () => {
  it('reports items that reference an effect via onUse', async () => {
    const c = createMemoryContentStores(); // healPotion.onUse uses 'heal'
    const refs = await findReferences(c, 'effect', 'heal');
    expect(refs).toContain('item:healPotion.onUse');
  });
  it('reports skills that reference an attribute via targetStat', async () => {
    const c = createMemoryContentStores(); // slash.targetStat = 'str'
    const refs = await findReferences(c, 'attribute', 'str');
    expect(refs).toEqual(expect.arrayContaining(['skill:slash.targetStat']));
  });
  it('reports enemies that reference a skill via skillPriority', async () => {
    const c = createMemoryContentStores(); // goblin.skillPriority = ['slash']
    expect(await findReferences(c, 'skill', 'slash')).toContain('enemy:goblin.skillPriority');
  });
  it('reports enemies that reference an item via reward.drops', async () => {
    const c = createMemoryContentStores(); // goblin drops healPotion
    expect(await findReferences(c, 'item', 'healPotion')).toContain('enemy:goblin.reward.drops');
  });
  it('returns [] for an unreferenced id', async () => {
    const c = createMemoryContentStores();
    expect(await findReferences(c, 'item', 'torch')).toEqual([]);
  });
});
