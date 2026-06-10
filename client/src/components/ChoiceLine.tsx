import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme';

/** A story choice rendered as a handwritten line at the bottom of the page. */
export function ChoiceLine({
  text, onPress, disabled = false, tone = 'default',
}: {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.line, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.text, tone === 'danger' && styles.danger]}>❧ {text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderStyle: 'dotted',
    borderColor: colors.pageEdge,
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  text: { ...type.hand, color: colors.inkAccent },
  danger: { color: colors.inkRed },
});
