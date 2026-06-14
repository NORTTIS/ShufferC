import { ContentSet } from '../../shared/types';
import { ContentStores } from '../store/contentStores';
import { EntityStore, StoreError } from '../store/EntityStore';
import { GameError } from '../session';

// Dependency order: attributes first, enemies last (enemies reference items + skills).
const ORDER: (keyof ContentSet)[] = ['attributes', 'effects', 'skills', 'items', 'enemies'];

/** Commit a draft's staged content into the global content stores. Throws GameError(409)
 *  if any staged id already exists. Order matters so references resolve as they land. */
export async function flushStagedContent(stores: ContentStores, staged: ContentSet): Promise<void> {
  for (const kind of ORDER) {
    const store = stores[kind] as EntityStore<{ id: string }>;
    for (const entity of Object.values(staged[kind])) {
      try {
        await store.create(entity);
      } catch (e) {
        if (e instanceof StoreError && e.kind === 'conflict') {
          throw new GameError(`${kind} ${entity.id} already exists`, 409);
        }
        throw e;
      }
    }
  }
}
