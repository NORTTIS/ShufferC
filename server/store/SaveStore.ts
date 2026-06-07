import { SaveState } from '../../shared/types';

export interface SaveStore {
  create(save: SaveState): Promise<string>;
  get(id: string): Promise<SaveState | null>;
  put(id: string, save: SaveState): Promise<void>;
}
