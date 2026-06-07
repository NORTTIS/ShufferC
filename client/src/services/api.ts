import type {
  SaveState, StoryNode, Stats, CombatResult,
} from '../../../shared/types';
import type { Background } from '../../../shared/backgrounds';
import { config } from '../config';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SessionView {
  save: SaveState;
  node: StoryNode;
  effectiveStats: Stats;
  ending?: string;
}
export interface ChoiceView extends SessionView {
  checkPassed?: boolean;
  roll?: number;
  combat?: CombatResult;
}
export interface NewGameView extends SessionView {
  sessionId: string;
}
export interface EquipView {
  save: SaveState;
  effectiveStats: Stats;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((body as { error?: string }).error ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

export const gameApi = {
  listBackgrounds: () => call<Background[]>('/backgrounds'),
  newGame: (backgroundId: string) =>
    call<NewGameView>('/sessions', { method: 'POST', body: JSON.stringify({ backgroundId }) }),
  getView: (id: string) => call<SessionView>(`/sessions/${id}`),
  choose: (id: string, choiceId: string, skillPriority?: string[]) =>
    call<ChoiceView>(`/sessions/${id}/choice`, {
      method: 'POST',
      body: JSON.stringify({ choiceId, skillPriority }),
    }),
  equip: (id: string, slot: string, itemId: string | null) =>
    call<EquipView>(`/sessions/${id}/equip`, {
      method: 'POST',
      body: JSON.stringify({ slot, itemId }),
    }),
};
