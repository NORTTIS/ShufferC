import { SaveState } from '../../shared/types';

export interface SaveSummary { id: string; routeId: string; updatedAt: string; }

export interface SaveStore {
  create(save: SaveState, userId: string): Promise<string>;
  get(id: string): Promise<SaveState | null>;
  put(id: string, save: SaveState): Promise<void>;
  /** Owning user id; null if the save does not exist (or is a pre-auth legacy row). */
  owner(id: string): Promise<string | null>;
  /** Newest first. */
  listByUser(userId: string): Promise<SaveSummary[]>;
}
