// Sprite/icon registry. Slice B uses emoji/colour placeholders keyed the same
// way the engine refers to sprites ("enemy.goblin", "skill.slash", ...).
// Real art is wired in a later sub-project; consumers must go through ASSETS.
export const ASSETS: Record<string, string> = {
  'enemy.goblin': '👺',
  'skill.slash': '🗡️',
  'skill.freeze': '❄️',
  'skill.regen': '✨',
  'item.dagger': '🔪',
  'item.ring': '💍',
  'item.torch': '🔦',
};

export function sprite(key: string | undefined): string {
  if (!key) return '❔';
  return ASSETS[key] ?? '❔';
}
