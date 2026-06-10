export const colors = {
  // ── book palette (UI v2) ──
  deskWood: '#221710',     // desk background
  page: '#f4ead6',         // parchment
  pageEdge: '#d9c7a4',     // page border / rules
  ink: '#3a2f23',          // primary ink
  inkFaded: '#8d7d66',     // past journal entries
  inkAccent: '#6b4f2a',    // choices, links
  inkRed: '#a23329',       // failure, danger, stamps
  inkGreen: '#5b7a3e',     // success
  noteYellow: '#f5e9a9',   // status note
  noteBlue: '#cfe2ef',     // inventory note
  notePink: '#f0d4d2',     // reputation / error note
  noteInk: '#4a3d1f',      // text on notes
  notePin: '#b03a2e',      // pin dot

  // ── legacy palette (removed in the cleanup task once no component uses it) ──
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

export const fonts = {
  serif: 'CrimsonPro_400Regular',
  serifSemi: 'CrimsonPro_600SemiBold',
  hand: 'PatrickHand_400Regular',
} as const;

/** Small rotations applied to paper notes, picked by index (i % tilts.length). */
export const tilts = [-2.5, 1.8, -1.2, 2.2] as const;

export const type = {
  // legacy entries (removed in cleanup)
  display: { fontSize: 28, lineHeight: 34, fontFamily: 'Georgia', fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontFamily: 'Georgia', fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontFamily: 'Georgia', fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontFamily: 'Georgia' },
  label: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },

  // book typography (UI v2)
  prose: { fontSize: 18, lineHeight: 30, fontFamily: fonts.serif },
  chapter: { fontSize: 14, lineHeight: 20, fontFamily: fonts.serifSemi, letterSpacing: 1.5 },
  hand: { fontSize: 17, lineHeight: 24, fontFamily: fonts.hand },
  handSmall: { fontSize: 14, lineHeight: 19, fontFamily: fonts.hand },
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
