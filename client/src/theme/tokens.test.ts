import { colors, space, radii, type, fonts, tilts } from './tokens';

describe('theme tokens', () => {
  it('exposes the book palette', () => {
    expect(colors.deskWood).toBe('#221710');
    expect(colors.page).toBe('#f4ead6');
    expect(colors.ink).toBe('#3a2f23');
    expect(colors.noteYellow).toBe('#f5e9a9');
    expect(colors.noteBlue).toBe('#cfe2ef');
    expect(colors.notePink).toBe('#f0d4d2');
  });

  it('has a 4-base spacing scale and radii', () => {
    expect(space.md).toBe(12);
    expect(space.lg).toBe(16);
    expect(radii.md).toBe(10);
  });

  it('defines book typography and note tilts', () => {
    expect(type.prose.fontFamily).toBe(fonts.serif);
    expect(type.prose.fontSize).toBe(18);
    expect(type.hand.fontFamily).toBe(fonts.hand);
    expect(tilts.length).toBeGreaterThanOrEqual(4);
  });
});
