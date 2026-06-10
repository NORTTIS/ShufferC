import { colors, space, radii, type, toneColor, fonts, tilts } from './tokens';

describe('theme tokens', () => {
  it('exposes the dark-fantasy palette', () => {
    expect(colors.bgBase).toBe('#16110d');
    expect(colors.gold).toBe('#c8a24a');
    expect(colors.danger).toBe('#b0432f');
  });

  it('has a 4-base spacing scale and radii', () => {
    expect(space.md).toBe(12);
    expect(space.lg).toBe(16);
    expect(radii.md).toBe(10);
  });

  it('defines a serif body type entry', () => {
    expect(type.body.fontSize).toBe(16);
    expect(type.body.lineHeight).toBe(24);
    expect(type.body.fontFamily).toBe('Georgia');
  });

  it('maps tones to palette colors', () => {
    expect(toneColor('gold')).toBe(colors.gold);
    expect(toneColor('danger')).toBe(colors.danger);
    expect(toneColor('mana')).toBe(colors.mana);
    expect(toneColor('success')).toBe(colors.success);
    expect(toneColor('muted')).toBe(colors.inkMuted);
  });

  it('exposes the book palette', () => {
    expect(colors.deskWood).toBe('#221710');
    expect(colors.page).toBe('#f4ead6');
    expect(colors.ink).toBe('#3a2f23');
    expect(colors.noteYellow).toBe('#f5e9a9');
    expect(colors.noteBlue).toBe('#cfe2ef');
    expect(colors.notePink).toBe('#f0d4d2');
  });

  it('defines book typography and note tilts', () => {
    expect(type.prose.fontFamily).toBe(fonts.serif);
    expect(type.hand.fontFamily).toBe(fonts.hand);
    expect(tilts.length).toBeGreaterThanOrEqual(4);
  });
});
