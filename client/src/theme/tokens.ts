export const colors = {
  bgBase: '#16110d',
  bgPanel: '#211a13',
  bgRaised: '#2c2218',
  inkPrimary: '#ece3d0',
  inkMuted: '#a89a80',
  gold: '#c8a24a',
  goldDim: '#7a6531',
  danger: '#b0432f',
  mana: '#4a6fa5',
  success: '#5b8a4a',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 6, md: 10, lg: 16 } as const;

export const type = {
  display: { fontSize: 28, lineHeight: 34, fontFamily: 'Georgia', fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontFamily: 'Georgia', fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontFamily: 'Georgia', fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontFamily: 'Georgia' },
  label: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
} as const;

export type Tone = 'gold' | 'danger' | 'mana' | 'success' | 'muted';

export function toneColor(tone: Tone): string {
  switch (tone) {
    case 'gold': return colors.gold;
    case 'danger': return colors.danger;
    case 'mana': return colors.mana;
    case 'success': return colors.success;
    case 'muted': return colors.inkMuted;
  }
}
