import React from 'react';
import { View, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radii, space } from '../theme';

export function Card({
  children, onPress, active = false, style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  active?: boolean;
  style?: ViewStyle;
}) {
  const content = <View style={[styles.card, active && styles.active, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgPanel, borderWidth: 1, borderColor: colors.goldDim, borderRadius: radii.md, padding: space.md, gap: space.sm },
  active: { borderColor: colors.gold },
  pressed: { opacity: 0.85 },
});
