import { desc, eq } from 'drizzle-orm';
import { SaveState } from '../../shared/types';
import { SaveStore, SaveSummary } from './SaveStore';
import { Db } from '../db/client';
import { saveStates } from '../db/schema';

export function createPgSaveStore(db: Db): SaveStore {
  return {
    async create(save: SaveState, userId: string): Promise<string> {
      const rows = await db.insert(saveStates)
        .values({ routeId: save.routeId, save, userId })
        .returning({ id: saveStates.id });
      return rows[0].id;
    },
    async get(id: string): Promise<SaveState | null> {
      const rows = await db.select().from(saveStates).where(eq(saveStates.id, id));
      return rows[0] ? (rows[0].save as SaveState) : null;
    },
    async put(id: string, save: SaveState): Promise<void> {
      await db.update(saveStates)
        .set({ routeId: save.routeId, save, updatedAt: new Date() })
        .where(eq(saveStates.id, id));
    },
    async owner(id: string): Promise<string | null> {
      const rows = await db.select({ userId: saveStates.userId }).from(saveStates).where(eq(saveStates.id, id));
      return rows[0]?.userId ?? null;
    },
    async listByUser(userId: string): Promise<SaveSummary[]> {
      const rows = await db.select({ id: saveStates.id, routeId: saveStates.routeId, updatedAt: saveStates.updatedAt })
        .from(saveStates)
        .where(eq(saveStates.userId, userId))
        .orderBy(desc(saveStates.updatedAt));
      return rows.map((r) => ({ id: r.id, routeId: r.routeId, updatedAt: r.updatedAt.toISOString() }));
    },
  };
}
