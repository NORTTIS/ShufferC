import { useCallback, useState } from 'react';
import { gameApi, ApiError } from '../services/api';
import type { SessionView, ChoiceView } from '../services/api';

export type Screen = 'charcreate' | 'story' | 'combat' | 'inventory' | 'ending';

export interface GameState {
  screen: Screen;
  sessionId: string | null;
  view: SessionView | null;
  lastChoice: ChoiceView | null; // holds combat log / check result after a choice
  pendingFightChoiceId: string | null; // choice that routed us into the combat screen
  error: string | null;
  busy: boolean;
}

const INITIAL: GameState = {
  screen: 'charcreate',
  sessionId: null,
  view: null,
  lastChoice: null,
  pendingFightChoiceId: null,
  error: null,
  busy: false,
};

export function useGameSession() {
  const [state, setState] = useState<GameState>(INITIAL);

  const run = useCallback(async (fn: () => Promise<Partial<GameState>>) => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const patch = await fn();
      setState((s) => ({ ...s, busy: false, ...patch }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Network error';
      setState((s) => ({ ...s, busy: false, error: message }));
    }
  }, []);

  const start = useCallback((backgroundId: string) => run(async () => {
    const res = await gameApi.newGame(backgroundId);
    return { sessionId: res.sessionId, view: res, screen: 'story' as Screen };
  }), [run]);

  const screenAfter = (v: SessionView): Screen =>
    v.ending ? 'ending' : v.node.choices.length === 0 ? 'ending' : 'story';

  // Called for skill-check / plain choices (Story screen).
  const choose = useCallback((choiceId: string) => run(async () => {
    const id = state.sessionId!;
    const res = await gameApi.choose(id, choiceId);
    return { view: res, lastChoice: res, screen: screenAfter(res) };
  }), [run, state.sessionId]);

  // Called when the player selects a fight choice — route to Combat to arrange priority.
  const enterCombat = useCallback((choiceId: string) => {
    setState((s) => ({ ...s, pendingFightChoiceId: choiceId, screen: 'combat' }));
  }, []);

  // Called by the Combat screen after the player confirms skill priority.
  const fight = useCallback((skillPriority: string[]) => run(async () => {
    const id = state.sessionId!;
    const choiceId = state.pendingFightChoiceId!;
    const res = await gameApi.choose(id, choiceId, skillPriority);
    const screen: Screen = res.ending === 'defeat' ? 'ending' : screenAfter(res);
    return { view: res, lastChoice: res, pendingFightChoiceId: null, screen };
  }), [run, state.sessionId, state.pendingFightChoiceId]);

  const equip = useCallback((slot: string, itemId: string | null) => run(async () => {
    const id = state.sessionId!;
    const res = await gameApi.equip(id, slot, itemId);
    // merge updated save/effectiveStats back into the current view
    const view = state.view ? { ...state.view, save: res.save, effectiveStats: res.effectiveStats } : null;
    return { view };
  }), [run, state.sessionId, state.view]);

  const goTo = useCallback((screen: Screen) => {
    setState((s) => ({ ...s, screen }));
  }, []);

  return { state, start, choose, enterCombat, fight, equip, goTo };
}
