import { EntityStore, StoreError } from './EntityStore';

export function createMemoryEntityStore<T extends { id: string }>(seed: T[] | Record<string, T> = []): EntityStore<T> {
  const arr = Array.isArray(seed) ? seed : Object.values(seed);
  const map = new Map<string, T>(arr.map((e) => [e.id, structuredClone(e)]));
  return {
    async list() { return [...map.values()].map((e) => structuredClone(e)); },
    async get(id) { const f = map.get(id); return f ? structuredClone(f) : null; },
    async all() {
      const o: Record<string, T> = {};
      for (const [k, v] of map) o[k] = structuredClone(v);
      return o;
    },
    async create(entity) {
      if (map.has(entity.id)) throw new StoreError(`${entity.id} already exists`, 'conflict');
      map.set(entity.id, structuredClone(entity));
      return structuredClone(entity);
    },
    async update(id, entity) {
      if (!map.has(id)) throw new StoreError(`${id} not found`, 'notFound');
      const merged = structuredClone({ ...entity, id });
      map.set(id, merged);
      return structuredClone(merged);
    },
    async remove(id) { map.delete(id); },
  };
}
