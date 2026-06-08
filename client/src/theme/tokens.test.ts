import { colors, space, radii, type, toneColor } from './tokens';

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
});
