import type {
  SaveState, StoryNode, Stats, CombatResult, Item,
} from '../../../shared/types';
import type { Background } from '../../../shared/backgrounds';
import type { Rewards } from '../../../shared/engine/rewards';
import type { JournalEntry } from '../../../shared/engine/journal';
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
  journal: JournalEntry[];
  ending?: string;
  hasNextRoute?: boolean;
}
export interface ChoiceView extends SessionView {
  checkPassed?: boolean;
  roll?: number;
  combat?: CombatResult;
  reward?: Rewards;
}
export interface NewGameView extends SessionView {
  sessionId: string;
}
export interface EquipView {
  save: SaveState;
  effectiveStats: Stats;
}
export interface ShopView { stock: { item: Item; price: number }[] }
export interface ShopActionView { save: SaveState; effectiveStats: Stats }

export interface AuthUser { id: string; email: string; }
export interface AuthSession { token: string; refreshToken: string; user: AuthUser; }
export interface SaveSummary { id: string; routeId: string; updatedAt: string; }
export interface ApiSession { token: string; refreshToken: string; }

let session: ApiSession | null = null;
let sessionListener: (s: ApiSession | null) => void = () => {};

/** Set (or clear, with null) the tokens attached to every API call. */
export function setApiSession(s: ApiSession | null): void { session = s; }
/** Fires when an automatic refresh rotates the tokens (persist them) or fails (logout). */
export function onApiSessionChange(cb: (s: ApiSession | null) => void): void { sessionListener = cb; }

async function rawCall<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(`${config.apiBase}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((body as { error?: string }).error ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  if (!session) return false;
  try {
    const next = await rawCall<AuthSession>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    session = { token: next.token, refreshToken: next.refreshToken };
    sessionListener(session);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      session = null;
      sessionListener(null);
    }
    return false;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await rawCall<T>(path, init);
  } catch (err) {
    const expired = err instanceof ApiError && err.status === 401
      && session !== null && !path.startsWith('/auth/');
    if (expired && (await tryRefresh())) return rawCall<T>(path, init);
    throw err;
  }
}

export const gameApi = {
  listBackgrounds: () => call<Background[]>('/backgrounds'),
  newGame: (backgroundId: string, routeId?: string) =>
    call<NewGameView>('/sessions', { method: 'POST', body: JSON.stringify({ backgroundId, routeId }) }),
  continueRoute: (id: string) =>
    call<NewGameView>(`/sessions/${id}/continue`, { method: 'POST' }),
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
  getShop: (id: string) => call<ShopView>(`/sessions/${id}/shop`),
  buy: (id: string, itemId: string) =>
    call<ShopActionView>(`/sessions/${id}/buy`, { method: 'POST', body: JSON.stringify({ itemId }) }),
  useItem: (id: string, itemId: string) =>
    call<ShopActionView>(`/sessions/${id}/use`, { method: 'POST', body: JSON.stringify({ itemId }) }),
  register: (email: string, password: string) =>
    call<AuthSession>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    call<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  listSaves: () => call<SaveSummary[]>('/saves'),
};
