import { eq } from 'drizzle-orm';
import { Db } from '../db/client';
import { EntityStore } from './EntityStore';

// The five content tables all share { id: text pk, data: jsonb }. We type the
// table loosely here because Drizzle's generated table types are nominal.
type ContentTable = { id: unknown; data: unknown };

export function createPgEntityStore<T extends { id: string }>(db: Db, table: ContentTable): EntityStore<T> {
  const t = table as { id: never; data: never } & Record<string, never>;
  return {
    async list() {
      const rows = await db.select().from(t as never);
      return (rows as Array<{ data: T }>).map((r) => r.data);
    },
    async get(id) {
      const rows = await db.select().from(t as never).where(eq((table as unknown as { id: never }).id, id as never));
      return (rows[0] as { data: T } | undefined)?.data ?? null;
    },
    async all() {
      const rows = await db.select().from(t as never);
      const o: Record<string, T> = {};
      for (const r of rows as Array<{ data: T }>) o[r.data.id] = r.data;
      return o;
    },
    async create(entity) {
      await db.insert(t as never).values({ id: entity.id, data: entity } as never);
      return entity;
    },
    async update(id, entity) {
      const merged = { ...entity, id };
      await db.update(t as never).set({ data: merged } as never).where(eq((table as unknown as { id: never }).id, id as never));
      return merged;
    },
    async remove(id) {
      await db.delete(t as never).where(eq((table as unknown as { id: never }).id, id as never));
    },
  };
}
