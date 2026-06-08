import { eq } from 'drizzle-orm';
import { SaveState } from '../../shared/types';
import { SaveStore } from './SaveStore';
import { Db } from '../db/client';
import { saveStates } from '../db/schema';

export function createPgSaveStore(db: Db): SaveStore {
  return {
    async create(save: SaveState): Promise<string> {
      const rows = await db.insert(saveStates)
        .values({ routeId: save.routeId, save })
        .returning({ id: saveStates.id });
      return rows[0].id;
    },
    async get(id: string): Promise<SaveState | null> {
      const rows = await db.select().from(saveStates).where(eq(saveStates.id, id));
      return rows[0] ? (rows[0].save as SaveState) : null;
    },
    async put(id: string, save: SaveState): Promise<void> {
      await db.update(saveStates).set({ routeId: save.routeId, save }).where(eq(saveStates.id, id));
    },
  };
}
