import { randomUUID } from 'crypto';
import { SaveState } from '../../shared/types';
import { SaveStore } from './SaveStore';

export function createMemoryStore(): SaveStore {
  const map = new Map<string, SaveState>();
  return {
    async create(save: SaveState): Promise<string> {
      const id = randomUUID();
      map.set(id, structuredClone(save));
      return id;
    },
    async get(id: string): Promise<SaveState | null> {
      const found = map.get(id);
      return found ? structuredClone(found) : null;
    },
    async put(id: string, save: SaveState): Promise<void> {
      map.set(id, structuredClone(save));
    },
  };
}
