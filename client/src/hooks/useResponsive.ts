import { useWindowDimensions } from 'react-native';
import { resolveLayout, type Layout } from '../theme/layout';

export function useResponsive(): Layout {
  const { width } = useWindowDimensions();
  return resolveLayout(width);
}
