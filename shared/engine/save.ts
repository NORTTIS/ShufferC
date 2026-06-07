import { SaveState } from '../types';
import { SAVE_VERSION } from '../constants';

export function serialize(save: SaveState): string {
  return JSON.stringify(save);
}

export function deserialize(json: string): SaveState {
  const data = JSON.parse(json) as SaveState;
  if (data.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version ${data.version}, expected ${SAVE_VERSION}`);
  }
  return data;
}
