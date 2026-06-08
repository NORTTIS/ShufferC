export const BREAKPOINT_WIDE = 700;
export const BREAKPOINT_RAIL = 1000;
export const CONTENT_MAX_WIDTH = 680;

export interface Layout {
  mode: 'narrow' | 'wide';
  maxWidth?: number;
  showRail: boolean;
}

export function resolveLayout(width: number): Layout {
  const wide = width >= BREAKPOINT_WIDE;
  return {
    mode: wide ? 'wide' : 'narrow',
    maxWidth: wide ? CONTENT_MAX_WIDTH : undefined,
    showRail: width >= BREAKPOINT_RAIL,
  };
}
