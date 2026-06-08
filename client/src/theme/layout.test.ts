import { resolveLayout, BREAKPOINT_WIDE, BREAKPOINT_RAIL, CONTENT_MAX_WIDTH } from './layout';

describe('resolveLayout', () => {
  it('is narrow below the wide breakpoint', () => {
    const l = resolveLayout(BREAKPOINT_WIDE - 1);
    expect(l.mode).toBe('narrow');
    expect(l.maxWidth).toBeUndefined();
    expect(l.showRail).toBe(false);
  });

  it('becomes a centered column at the wide breakpoint', () => {
    const l = resolveLayout(BREAKPOINT_WIDE);
    expect(l.mode).toBe('wide');
    expect(l.maxWidth).toBe(CONTENT_MAX_WIDTH);
    expect(l.showRail).toBe(false);
  });

  it('shows the rail only at the rail breakpoint', () => {
    expect(resolveLayout(BREAKPOINT_RAIL - 1).showRail).toBe(false);
    expect(resolveLayout(BREAKPOINT_RAIL).showRail).toBe(true);
  });
});
