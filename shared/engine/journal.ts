import { RouteBundle, SaveState, JournalReward } from '../types';

/** One past step of the story, reconstructed from the save for display. */
export interface JournalEntry {
  prose: string;        // node prose at that step (live overlay applied)
  chosenText: string;   // text of the option the player picked (overlay applied)
  roll?: number;
  checkPassed?: boolean;
  reward?: JournalReward;
}

/**
 * Rebuild the play-through journal for the CURRENT route by walking choiceLog.
 * Entries from other routes, or whose node/choice no longer exists, are skipped
 * (admin edits must never crash a session). Pure: no I/O.
 */
export function buildJournal(bundle: RouteBundle, save: SaveState): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const log of save.choiceLog) {
    if (log.routeId && log.routeId !== save.routeId) continue;
    const raw = bundle.nodes[log.nodeId];
    if (!raw) continue;
    const idx = raw.choices.findIndex((c) => c.id === log.choiceId);
    if (idx === -1) continue;
    const overlay = save.liveNodes?.[log.nodeId];
    entries.push({
      prose: overlay?.prose ?? raw.prose,
      chosenText: overlay?.choiceTexts[idx] ?? raw.choices[idx].text,
      roll: log.roll,
      checkPassed: log.checkPassed,
      reward: log.reward,
    });
  }
  return entries;
}
